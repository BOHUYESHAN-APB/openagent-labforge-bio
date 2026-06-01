// Team tools messaging — with live delivery to idle members
import { randomUUID } from "node:crypto"
import { appendFile, mkdir, readdir, readFile, stat, unlink } from "node:fs/promises"
import { join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import type { TeamModeConfig } from "../../../config/schema/team-mode"
import type { Message, RuntimeState } from "../types"
import { MessageSchema } from "../types"
import { getInboxDir, resolveBaseDir } from "../team-registry/paths"
import { loadRuntimeState } from "../team-state-store/index"
import { log } from "../../../shared/logger"

/**
 * Build an envelope string for injecting a message into a session.
 */
function buildEnvelope(message: Message): string {
  const parts = [
    `## Message from ${message.from}`,
    `Kind: ${message.kind}`,
    `Timestamp: ${new Date(message.timestamp).toISOString()}`,
    ``,
    message.body,
  ]
  if (message.summary) {
    parts.push(``, `Summary: ${message.summary}`)
  }
  return parts.join("\n")
}

/**
 * Write a message to the recipient's inbox file.
 */
async function writeToInbox(
  teamRunId: string,
  recipientName: string,
  message: Message,
): Promise<void> {
  const baseDir = resolveBaseDir()
  const inboxDir = getInboxDir(baseDir, teamRunId, recipientName)
  await mkdir(inboxDir, { recursive: true })

  const filePath = join(inboxDir, `${message.messageId}.json`)
  await appendFile(filePath, JSON.stringify(message, null, 2) + "\n")
}

/**
 * Read unread messages from a member's inbox.
 */
async function readInboxMessages(
  teamRunId: string,
  memberName: string,
): Promise<Message[]> {
  const baseDir = resolveBaseDir()
  const inboxDir = getInboxDir(baseDir, teamRunId, memberName)

  try {
    const entries = await readdir(inboxDir, { withFileTypes: true })
    const messages: Message[] = []

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue
      if (entry.name.startsWith(".")) continue

      const filePath = join(inboxDir, entry.name)
      try {
        const content = await readFile(filePath, "utf8")
        const parsed = MessageSchema.safeParse(JSON.parse(content))
        if (parsed.success) {
          messages.push(parsed.data)
        }
      } catch {
        // Skip unreadable files
      }
    }

    return messages.sort((a, b) => a.timestamp - b.timestamp)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return []
    }
    throw error
  }
}

/**
 * Remove a message from the inbox after delivery.
 */
async function removeFromInbox(
  teamRunId: string,
  recipientName: string,
  messageId: string,
): Promise<void> {
  const baseDir = resolveBaseDir()
  const inboxDir = getInboxDir(baseDir, teamRunId, recipientName)
  const filePath = join(inboxDir, `${messageId}.json`)

  try {
    await unlink(filePath)
  } catch {
    // Ignore if file doesn't exist
  }
}

/**
 * Deliver a message to an idle member via session.promptAsync.
 * This wakes up the member session to process the message.
 */
async function deliverLive(
  client: PluginInput["client"],
  message: Message,
  recipientSessionId: string,
  directory: string,
): Promise<boolean> {
  try {
    const envelope = buildEnvelope(message)

    await client.session.promptAsync({
      path: { id: recipientSessionId },
      body: {
        parts: [
          {
            type: "text",
            text: [
              `## New Message from ${message.from}`,
              ``,
              envelope,
              ``,
              `---`,
              `Process this message and respond using team_send_message if needed.`,
            ].join("\n"),
          },
        ],
      },
      query: { directory },
    })

    log("[team-mailbox] Live delivery succeeded", {
      recipientSessionId,
      messageId: message.messageId,
      from: message.from,
    })

    return true
  } catch (error) {
    log("[team-mailbox] Live delivery failed, message left in inbox", {
      recipientSessionId,
      messageId: message.messageId,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/**
 * Send a message with live delivery.
 * 1. Write message to inbox (persistent)
 * 2. Check if recipient is idle
 * 3. If idle, deliver via session.promptAsync
 * 4. If busy, leave in inbox for later injection
 */
export async function teamSendMessage(
  teamName: string,
  teamRunId: string,
  to: string,
  from: string,
  body: string,
  client: PluginInput["client"],
  kind: Message["kind"] = "message",
): Promise<{ message: Message; delivered: boolean }> {
  const directory = process.cwd()

  // Create message
  const message: Message = {
    version: 1,
    messageId: randomUUID(),
    from,
    to,
    kind,
    body,
    timestamp: Date.now(),
  }

  // Validate message
  const validation = MessageSchema.safeParse(message)
  if (!validation.success) {
    throw new Error(`Invalid message: ${validation.error.message}`)
  }

  // Load runtime state to find recipient
  const runtimeState = await loadRuntimeState(teamRunId)
  if (!runtimeState) {
    throw new Error(`Team run "${teamRunId}" not found`)
  }
  const recipient = runtimeState.members.find(m => m.name === to)

  if (!recipient) {
    throw new Error(`Recipient "${to}" not found in team`)
  }

  // Write to inbox first (persistent storage)
  await writeToInbox(teamRunId, to, message)

  // Try live delivery if recipient is idle
  if (recipient.status === "idle" && recipient.sessionId) {
    const delivered = await deliverLive(client, message, recipient.sessionId, directory)
    if (delivered) {
      // Remove from inbox after successful delivery
      await removeFromInbox(teamRunId, to, message.messageId)
      return { message, delivered: true }
    }
  }

  // Message left in inbox for later injection
  log("[team-mailbox] Message stored in inbox", {
    teamRunId,
    to,
    from,
    recipientStatus: recipient.status,
    messageId: message.messageId,
  })

  return { message, delivered: false }
}

/**
 * Poll and deliver unread messages to a member.
 * Called when a member becomes idle.
 */
export async function pollAndDeliverMessages(
  teamRunId: string,
  memberName: string,
  client: PluginInput["client"],
): Promise<number> {
  const directory = process.cwd()
  const runtimeState = await loadRuntimeState(teamRunId)
  if (!runtimeState) {
    return 0
  }
  const member = runtimeState.members.find(m => m.name === memberName)

  if (!member || !member.sessionId) {
    return 0
  }

  // Only deliver to idle members
  if (member.status !== "idle") {
    return 0
  }

  // Read unread messages
  const messages = await readInboxMessages(teamRunId, memberName)
  if (messages.length === 0) {
    return 0
  }

  // Deliver first message via live delivery
  const message = messages[0]
  if (!message) {
    return 0
  }

  const delivered = await deliverLive(client, message, member.sessionId, directory)
  if (delivered) {
    await removeFromInbox(teamRunId, memberName, message.messageId)
    return 1
  }

  return 0
}

/**
 * Get all messages in a member's inbox (for status reporting).
 */
export async function getInboxMessages(
  teamRunId: string,
  memberName: string,
): Promise<Message[]> {
  return readInboxMessages(teamRunId, memberName)
}
