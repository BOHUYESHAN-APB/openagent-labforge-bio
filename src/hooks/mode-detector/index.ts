const SEARCH_PATTERN =
  /\b(search|find|locate|lookup|look\s*up|explore|discover|scan|grep|query|browse|detect|trace|seek|track|pinpoint|hunt)\b|where\s+is|show\s+me|list\s+all|검색|찾아|탐색|조회|스캔|서치|뒤져|찾기|어디|추적|탐지|찾아봐|찾아내|보여줘|목록|検索|探して|見つけて|サーチ|探索|スキャン|どこ|発見|捜索|見つけ出す|一覧|搜索|查找|寻找|查询|检索|定位|扫描|发现|在哪里|找出来|列出|tìm kiếm|tra cứu|định vị|quét|phát hiện|truy tìm|tìm ra|ở đâu|liệt kê/i;

const ANALYZE_PATTERN =
  /\b(analyze|analyse|investigate|examine|research|study|deep[\s-]?dive|inspect|audit|evaluate|assess|review|diagnose|scrutinize|dissect|debug|comprehend|interpret|breakdown|understand)\b|why\s+is|how\s+does|how\s+to|분석|조사|파악|연구|검토|진단|이해|설명|원인|이유|뜯어봐|따져봐|평가|해석|디버깅|디버그|어떻게|왜|살펴|分析|調査|解析|検討|研究|診断|理解|説明|検証|精査|究明|デバッグ|なぜ|どう|仕組み|调查|检查|剖析|深入|诊断|解释|调试|为什么|原理|搞清楚|弄明白|phân tích|điều tra|nghiên cứu|kiểm tra|xem xét|chẩn đoán|giải thích|tìm hiểu|gỡ lỗi|tại sao/i;

const HEAVY_PATTERN =
  /\b(plan|planning|design plan|make plan|create plan|设计计划|做计划|制定计划|规划|计划)\b/i;

const BIO_PATTERN =
  /\b(RNA-seq|scRNA|single.?cell|转录组|基因组|蛋白质组|代谢组|甲基化|ChIP-seq|ATAC-seq|CRISPR|基因编辑|序列比对|差异表达|富集分析|通路分析|系统发育|分子对接|蛋白结构|AlphaFold|变异检测|GWAS|生物信息|bioinformatic|sequencing|alignment|phylogen|epigenetic|metagenom|microbiome|proteom|metabolom)\b/i;

const CHEM_PATTERN =
  /\b(分子动力学|量子化学|DFT|密度泛函|分子模拟|配体对接|药效团|QSAR|化学信息|chem.informatic|molecular dynamics|quantum chemistry|docking|ADMET|药物设计|force field|力场|反应路径|过渡态|溶剂化|自由能|结合能)\b/i;

const SEARCH_PROMPT = `[search-mode]
MAXIMIZE SEARCH EFFORT. Launch multiple background agents IN PARALLEL:
- explore agents (codebase patterns, file structures, ast-grep)
- librarian agents (remote repos, official docs, GitHub examples)
Plus direct tools: Grep, ripgrep (rg), ast-grep (sg)
NEVER stop at first result - be exhaustive.`;

const ANALYZE_PROMPT = `[analyze-mode]
ANALYSIS MODE. Gather context before diving deep:

CONTEXT GATHERING (parallel):
- 1-2 explore agents (codebase patterns, implementations)
- 1-2 librarian agents (if external library involved)
- Direct tools: Grep, AST-grep, LSP for targeted searches

IF COMPLEX - DO NOT STRUGGLE ALONE. Consult specialists:
- **Oracle**: Conventional problems (architecture, debugging, complex logic)
- **Artistry**: Non-conventional problems (different approach needed)

SYNTHESIZE findings before proceeding.`;

const BIO_PROMPT = `[bio-mode]
BIOLOGICAL SCIENCE TASK detected. Load the relevant bioinformatics skills:

1. Use load_bio_skills(categories=["<category>"], query="<task intent>") to load the appropriate category
2. Follow the skill's workflow: data ingestion → QC → analysis → visualization
3. Use domain-specific tools (samtools, STAR, DESeq2, etc.) as directed by the skill
4. Write analysis HTML reports to .opencode/extendai-lab/pages/ for the user to view`;

const CHEM_PROMPT = `[chem-mode]
COMPUTATIONAL CHEMISTRY TASK detected. Approach with domain rigor:

1. Verify molecular structures before any computation
2. Follow the force field / method selection guidelines from chem skills
3. Validate results against known benchmarks where possible
4. Write analysis HTML reports to .opencode/extendai-lab/pages/ for the user to view`;

const pendingModeBySession = new Map<string, string>();

interface Message {
  role: string;
  parts: Array<{ type: string; text: string }>;
}

function extractUserText(messages: Message[]): string {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') return '';

  return lastMessage.parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
}

function detectMode(text: string, agent?: string): string | null {
  if (SEARCH_PATTERN.test(text)) return 'search';
  if (ANALYZE_PATTERN.test(text)) return 'analyze';
  if (BIO_PATTERN.test(text)) return 'bio';
  if (CHEM_PATTERN.test(text)) return 'chem';
  if (
    agent &&
    (agent === 'orchestrator' || agent === 'bio-orchestrator') &&
    HEAVY_PATTERN.test(text)
  ) {
    return 'heavy';
  }
  return null;
}

async function handleMessagesTransform(
  input: { sessionID?: string; agent?: string; messages: Message[] },
  _output: Record<string, unknown>,
): Promise<void> {
  const sessionID = input.sessionID;
  if (!sessionID) return;

  const text = extractUserText(input.messages);
  if (!text) return;

  const mode = detectMode(text, input.agent);
  if (mode) {
    pendingModeBySession.set(sessionID, mode);
  } else {
    pendingModeBySession.delete(sessionID);
  }
}

async function handleSystemTransform(
  input: { sessionID?: string },
  output: { system: string[] },
): Promise<void> {
  const sessionID = input.sessionID;
  if (!sessionID) return;

  const mode = pendingModeBySession.get(sessionID);
  if (!mode) return;

  const combinedSystem = output.system.join('\n');

  if (mode === 'search' && !combinedSystem.includes('[search-mode]')) {
    output.system.push(SEARCH_PROMPT);
  } else if (mode === 'analyze' && !combinedSystem.includes('[analyze-mode]')) {
    output.system.push(ANALYZE_PROMPT);
  } else if (mode === 'bio' && !combinedSystem.includes('[bio-mode]')) {
    output.system.push(BIO_PROMPT);
  } else if (mode === 'chem' && !combinedSystem.includes('[chem-mode]')) {
    output.system.push(CHEM_PROMPT);
  }
}

export function createModeDetectorHook() {
  return {
    'chat.message': handleMessagesTransform,
    'experimental.chat.system.transform': handleSystemTransform,
  };
}
