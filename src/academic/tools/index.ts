/**
 * Academic writing tools for MCP server
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export { checkTools, detectEnvironment } from "./check.js";
export type { ToolStatus, Environment } from "./check.js";
export { handleAcademicBuildDocx } from "./handlers.js";

/**
 * MCP tool definitions for academic writing
 */
export const academicTools: Tool[] = [
  {
    name: "academic_check_tools",
    description:
      "Check if academic writing tools are installed. Call only when needed, not on every startup.",
    inputSchema: {
      type: "object",
      properties: {
        tools: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "papis",
              "pandoc",
              "gh",
              "python-docx",
              "wsl",
              "docker",
              "xelatex",
              "noteexpress",
            ],
          },
          description:
            "Optional: specific tools to check. If not provided, checks all.",
        },
      },
    },
  },
  {
    name: "academic_build_docx",
    description:
      "Generate DOCX from Markdown manuscript (MD → HTML → DOCX pipeline to avoid Markdown syntax leakage)",
    inputSchema: {
      type: "object",
      properties: {
        manuscriptPath: {
          type: "string",
          description: "Path to manuscript.md",
        },
        options: {
          type: "object",
          properties: {
            fontCn: { type: "string", description: "Chinese font (default: SimSun)" },
            fontEn: {
              type: "string",
              description: "English/number font (default: Times New Roman)",
            },
            fontHeading: {
              type: "string",
              description: "Heading font (default: SimHei)",
            },
            sizeTitle: {
              type: "number",
              description: "Title font size in pt (default: 16)",
            },
            sizeHeading: {
              type: "number",
              description: "Heading font size in pt (default: 15)",
            },
            sizeBody: {
              type: "number",
              description: "Body font size in pt (default: 14)",
            },
            lineSpacing: {
              type: "number",
              description: "Line spacing multiplier (default: 1.5)",
            },
          },
        },
      },
      required: ["manuscriptPath"],
    },
  },
];
