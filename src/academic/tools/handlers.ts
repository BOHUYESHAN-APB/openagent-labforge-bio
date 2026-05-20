import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Build DOCX from Markdown manuscript
 * Pipeline: MD → HTML (pandoc) → DOCX (Python script)
 */
export async function handleAcademicBuildDocx(args: {
  manuscriptPath: string;
  options?: {
    fontCn?: string;
    fontEn?: string;
    fontHeading?: string;
    sizeTitle?: number;
    sizeHeading?: number;
    sizeBody?: number;
    lineSpacing?: number;
  };
}): Promise<string> {
  const { manuscriptPath, options = {} } = args;

  // Default options
  const config = {
    fontCn: options.fontCn || "SimSun",
    fontEn: options.fontEn || "Times New Roman",
    fontHeading: options.fontHeading || "SimHei",
    sizeTitle: options.sizeTitle || 16,
    sizeHeading: options.sizeHeading || 15,
    sizeBody: options.sizeBody || 14,
    lineSpacing: options.lineSpacing || 1.5,
  };

  // Resolve paths
  const mdPath = path.resolve(manuscriptPath);
  const htmlPath = mdPath.replace(/\.md$/, ".html");
  const docxPath = mdPath.replace(/\.md$/, ".docx");

  // Step 1: Pandoc MD → HTML
  await runPandoc(mdPath, htmlPath);

  // Step 2: Python script HTML → DOCX
  await runHtmlToDocx(htmlPath, docxPath, config);

  return docxPath;
}

/**
 * Run pandoc to convert MD to HTML
 */
function runPandoc(mdPath: string, htmlPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check for bibliography file
    const bibPath = mdPath.replace(/\.md$/, ".bib");
    const args = [mdPath, "-o", htmlPath, "--standalone"];

    // Add bibliography if exists
    const fs = require("node:fs");
    if (fs.existsSync(bibPath)) {
      args.push("--citeproc", `--bibliography=${bibPath}`);
    }

    const proc = spawn("pandoc", args, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Pandoc failed with code ${code}. Make sure pandoc is installed.\n${stderr}`,
          ),
        );
      }
    });

    proc.on("error", (err) => {
      reject(
        new Error(
          `Failed to run pandoc. Make sure it is installed: ${err.message}`,
        ),
      );
    });
  });
}

/**
 * Run Python script to convert HTML to DOCX
 */
function runHtmlToDocx(
  htmlPath: string,
  docxPath: string,
  config: {
    fontCn: string;
    fontEn: string;
    fontHeading: string;
    sizeTitle: number;
    sizeHeading: number;
    sizeBody: number;
    lineSpacing: number;
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "../scripts/html_to_docx.py");

    const args = [
      scriptPath,
      htmlPath,
      docxPath,
      `--font-cn=${config.fontCn}`,
      `--font-en=${config.fontEn}`,
      `--font-heading=${config.fontHeading}`,
      `--size-title=${config.sizeTitle}`,
      `--size-heading=${config.sizeHeading}`,
      `--size-body=${config.sizeBody}`,
      `--line-spacing=${config.lineSpacing}`,
    ];

    const proc = spawn("python", args, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `HTML to DOCX conversion failed with code ${code}. Make sure python-docx is installed (pip install python-docx beautifulsoup4 lxml).\n${stderr}`,
          ),
        );
      }
    });

    proc.on("error", (err) => {
      reject(
        new Error(
          `Failed to run Python script. Make sure Python is installed: ${err.message}`,
        ),
      );
    });
  });
}
