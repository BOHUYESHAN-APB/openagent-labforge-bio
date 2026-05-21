#!/usr/bin/env python3
"""
CNKI Citation Parser — 自动检测并解析知网多种导出格式

支持格式:
  - CNKI 详细导出 (.txt)    SrcDatabase-来源库: / Title-题名:
  - NoteExpress (.net)      {Title}: / {Author}:
  - EndNote (.ris)          TY / AU / TI / ...
  - BibTeX (.bib)           @article{...}
  - GB/T 7714 / MLA / APA  格式化引用文本
  - Refworks / 查新格式      自定义标签

用法:
  python cnki_parser.py detect <file>           # 检测格式
  python cnki_parser.py parse <file> [files...] # 解析并输出 JSON
  python cnki_parser.py merge <dir>             # 合并目录下所有文件
"""

import json
import re
import sys
from pathlib import Path
from typing import Any, Optional


# ──────────────────────────────────────────────
# 格式检测
# ──────────────────────────────────────────────

def detect_format(text: str, filename: str = "") -> str:
    """自动检测 CNKI 导出格式"""
    # 优先级从具体到通用
    if filename.endswith(".net") or text.lstrip().startswith("{Reference Type}"):
        return "noteexpress"
    if filename.endswith(".ris") or any(line.startswith("TY  -") for line in text.split("\n")[:10]):
        return "endnote"
    if filename.endswith(".bib") or re.search(r"@\w+\{", text[:200]):
        return "bibtex"
    # CNKI 详细导出：有 SrcDatabase-来源库: 标记
    if "SrcDatabase-来源库:" in text[:500]:
        return "cnki_detail"
    # 检查 GB/T 7714 格式：[N] 作者.标题[J].期刊,年份.
    first_line = text.strip().split("\n")[0].strip()
    if re.match(r'^\[\d+\]', first_line) and '[' in first_line and 'J]' in first_line:
        return "gbt7714"
    # 检查是不是纯文本引用列表（MLA/APA 风格 - 没有结构标签）
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    if len(lines) >= 2 and len(lines) <= 50:
        # 每行像一条引用
        if any(kw in text for kw in ["Journal]", "[J]", "出版社", "出版年"]):
            return "gbt7714"
    return "unknown"


# ──────────────────────────────────────────────
# 解析器：CNKI 详细导出
# ──────────────────────────────────────────────

PARSERS = {}

def parser(name: str):
    """注册解析器的装饰器"""
    def decorator(fn):
        PARSERS[name] = fn
        return fn
    return decorator


@parser("cnki_detail")
def parse_cnki_detail(text: str) -> list[dict]:
    """解析 CNKI 详细导出格式（SrcDatabase-来源库:）"""
    entries = []
    current = {}
    
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            if current.get("title"):
                entries.append(current)
                current = {}
            continue
        
        # 关键修复：用 partition(':') 而不是 ': ' in line 判断
        # 因为 CNKI 的 "Author-作者:李金哲" 冒号后无空格！
        if ":" in line:
            kp, _, val = line.partition(":")
            val = val.strip()
            key = kp.split("-")[0].strip()
            
            # 字段名映射表
            FIELD_MAP = {
                "Title": "title",
                "Author": "author",
                "Organ": "organization",
                "Source": "journal",
                "Keyword": "keywords",
                "Summary": "abstract",
                "PubTime": "pub_time",
                "Year": "year",
                "Volume": "volume",
                "Period": "issue",
                "PageCount": "pages",
                "CLC": "clc_code",
                "ISSN": "issn",
                "ISBN/ISSN": "issn",
                "URL": "url",
                "DOI": "doi",
                "Fund": "fund",
                "FirstDuty": "first_author",
                "SrcDatabase": "database",
            }
            mapped = FIELD_MAP.get(key)
            if mapped:
                current[mapped] = val
            elif key not in ("SrcDatabase",):  
                # 记录未知字段但跳过已知的非数据字段
                pass
    
    if current.get("title"):
        entries.append(current)
    
    return entries


@parser("noteexpress")
def parse_noteexpress(text: str) -> list[dict]:
    """解析 NoteExpress .net 格式"""
    entries = []
    current = {}
    
    FIELD_MAP = {
        "Reference Type": "type_raw",
        "Title": "title",
        "Author": "author",
        "Author Address": "organization",
        "Journal": "journal",
        "Year": "year",
        "Volume": "volume",
        "Issue": "issue",
        "Pages": "pages",
        "Keywords": "keywords",
        "Abstract": "abstract",
        "ISBN/ISSN": "issn",
        "Notes": "notes",
        "URL": "url",
        "DOI": "doi",
        "Database Provider": "database",
    }
    
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            if current.get("title"):
                entries.append(current)
                current = {}
            continue
        
        m = re.match(r"\{([^}]+)\}:\s*(.*)", line)
        if m:
            key = m.group(1).strip()
            val = m.group(2).strip()
            mapped = FIELD_MAP.get(key)
            if mapped:
                # 如果字段已存在（多行值），追加
                if mapped in current:
                    current[mapped] += " " + val
                else:
                    current[mapped] = val
    
    if current.get("title"):
        entries.append(current)
    
    return entries


@parser("endnote")
def parse_endnote(text: str) -> list[dict]:
    """解析 EndNote .ris 格式"""
    entries = []
    current = {}
    
    TAG_MAP = {
        "T1": "title", "TI": "title", "T2": "journal", "T3": "series",
        "AU": "author", "A1": "author", "A2": "author_secondary",
        "Y1": "year", "Y2": "year",
        "PY": "year",
        "VL": "volume", "IS": "issue",
        "SP": "start_page", "EP": "end_page",
        "AB": "abstract", "N1": "notes",
        "KW": "keywords",
        "DO": "doi", "UR": "url",
        "SN": "issn", "M1": "misc",
        "JF": "journal", "JO": "journal", "JA": "journal_abbr",
        "PB": "publisher", "CY": "place_published",
        "ET": "edition",
        "AD": "author_address",
    }
    
    # RIS 字段可能有空格对齐: "AU  - Author Name"
    for line in text.split("\n"):
        line = line.rstrip()
        if not line:
            continue
        
        m = re.match(r"([A-Z0-9]+)\s*[-]{2}\s*(.*)", line)
        if m:
            tag = m.group(1)
            val = m.group(2).strip()
            
            if tag == "ER":
                if current.get("title"):
                    entries.append(current)
                current = {}
            elif tag == "TY":
                current["type_raw"] = val
            elif tag in TAG_MAP:
                mapped = TAG_MAP[tag]
                if mapped in current:
                    if isinstance(current[mapped], list):
                        current[mapped].append(val)
                    else:
                        current[mapped] = [current[mapped], val]
                else:
                    current[mapped] = val
    
    if current.get("title") and "type_raw" in current:
        entries.append(current)
    
    return entries


@parser("bibtex")
def parse_bibtex(text: str) -> list[dict]:
    """解析 BibTeX 格式"""
    entries = []
    
    # 简单 BibTeX 解析器
    bib_pattern = re.compile(
        r'@(\w+)\s*\{\s*([^,]+),\s*(.*?)\s*\}',
        re.DOTALL
    )
    
    for match in bib_pattern.finditer(text):
        entry_type = match.group(1).lower()
        citekey = match.group(2).strip()
        fields_text = match.group(3)
        
        entry = {
            "_type": entry_type,
            "_citekey": citekey,
        }
        
        # 解析字段
        field_pattern = re.compile(
            r'(\w+)\s*=\s*\{([^}]*)\}|(\w+)\s*=\s*"([^"]*)"',
            re.DOTALL
        )
        for fm in field_pattern.finditer(fields_text):
            key = (fm.group(1) or fm.group(3)).lower()
            val = (fm.group(2) or fm.group(4)).strip()
            
            FIELD_MAP_BIB = {
                "title": "title",
                "author": "author",
                "journal": "journal",
                "booktitle": "booktitle",
                "year": "year",
                "volume": "volume",
                "number": "issue",
                "pages": "pages",
                "doi": "doi",
                "url": "url",
                "abstract": "abstract",
                "keywords": "keywords",
                "publisher": "publisher",
                "address": "place_published",
                "issn": "issn",
                "isbn": "isbn",
                "note": "notes",
            }
            mapped = FIELD_MAP_BIB.get(key)
            if mapped:
                entry[mapped] = val
        
        entries.append(entry)
    
    return entries


@parser("gbt7714")
def parse_gbt7714(text: str) -> list[dict]:
    """解析 GB/T 7714 格式化引文文本"""
    entries = []
    
    # 匹配 [N] 开头 -> 引文内容
    pattern = re.compile(r'\[(\d+)\]\s*(.*?)(?=\n\[\d+\]|\Z)', re.DOTALL)
    
    for match in pattern.finditer(text):
        num = match.group(1)
        body = match.group(2).strip()
        
        entry = {
            "_ref_num": int(num),
            "_raw": body,
        }
        
        # 尝试解析 GB/T 7714 结构
        # 格式: 作者.标题[文献类型].期刊,年份,卷(期):页码.
        gb_pattern = re.compile(
            r'^(.*?)\.\s*(.*?)\[([JDMSCP])\][.。]\s*(.*?),.*?(\d{4})',
            re.DOTALL
        )
        gm = gb_pattern.match(body)
        if gm:
            entry["author"] = gm.group(1).strip()
            entry["title"] = gm.group(2).strip()
            entry["type"] = gm.group(3)
            entry["journal"] = gm.group(4).strip()
            entry["year"] = gm.group(5)
        
        entries.append(entry)
    
    return entries


# ──────────────────────────────────────────────
# 多源合并
# ──────────────────────────────────────────────

def normalize_author(author_str: Any) -> str:
    """统一作者格式：分号分隔 → 逗号分隔"""
    if isinstance(author_str, list):
        return ", ".join(author_str)
    if not author_str:
        return ""
    # CNKI 格式：名字用分号分隔
    result = author_str.replace(";", ",")
    return result


def merge_entries(entries_list: list[list[dict]]) -> list[dict]:
    """合并多个解析来源的结果"""
    all_entries = []
    
    # 简单策略：所有解析结果按顺序保留
    for src_name, entries in entries_list:
        for entry in entries:
            entry["_source"] = src_name
            all_entries.append(entry)
    
    return all_entries


def dedup_by_title(entries: list[dict]) -> list[dict]:
    """按标题去重"""
    seen = set()
    result = []
    for entry in entries:
        title = entry.get("title", "")
        # 用前 30 个字符作为去重 key
        key = title[:30].replace(" ", "").lower() if title else ""
        if key and key not in seen:
            seen.add(key)
            result.append(entry)
        elif not key:
            result.append(entry)
    return result


def enrich_entry(entry: dict) -> dict:
    """补全/修正字段"""
    e = dict(entry)
    
    # 统一作者格式
    if "author" in e:
        e["author"] = normalize_author(e["author"])
    
    # 文献类型推断
    if e.get("type") not in ("J", "D", "M", "C", "P", "S"):
        src = e.get("database", "")
        if "博士" in src or "硕士" in src:
            e["type"] = "D"
        elif "期刊" in src:
            e["type"] = "J"
    
    # 年份：PubTime 或 Year
    if not e.get("year") and e.get("pub_time"):
        m = re.match(r"(\d{4})", str(e["pub_time"]))
        if m:
            e["year"] = m.group(1)
    
    # 生成 ref 标识
    if not e.get("_ref_num") and e.get("title"):
        # 取标题首字 + 年份
        authors = e.get("author", "")
        first_author = authors.split(",")[0] if authors else "佚名"
        year = e.get("year", "0000")
        e["_ref"] = f"{first_author}_{year}"
    
    return e


# ──────────────────────────────────────────────
# 主接口
# ──────────────────────────────────────────────

def parse_file(filepath: str) -> dict:
    """解析单个文件，返回格式信息和条目列表"""
    path = Path(filepath)
    if not path.exists():
        return {"error": f"File not found: {filepath}", "entries": []}
    
    text = path.read_text(encoding="utf-8", errors="replace")
    fmt = detect_format(text, path.name)
    
    parser_fn = PARSERS.get(fmt)
    if not parser_fn:
        return {"format": fmt, "error": f"No parser for format: {fmt}", "entries": []}
    
    try:
        entries = parser_fn(text)
    except Exception as e:
        return {"format": fmt, "error": str(e), "entries": []}
    
    # 补全每个条目
    entries = [enrich_entry(e) for e in entries]
    
    return {
        "file": path.name,
        "format": fmt,
        "count": len(entries),
        "entries": entries,
    }


def parse_files(filepaths: list[str]) -> list[dict]:
    """解析多个文件"""
    results = []
    for fp in filepaths:
        result = parse_file(fp)
        results.append(result)
    return results


def merge_results(results: list[dict]) -> list[dict]:
    """合并多个解析结果的条目"""
    all_entries = []
    # 从后往前优先（后解析的覆盖先解析的）
    for result in reversed(results):
        if result.get("entries"):
            all_entries.extend(result["entries"])
    return dedup_by_title(all_entries)


def format_json(entries: list[dict], indent: int = 2) -> str:
    """格式化为 JSON 输出"""
    clean = []
    for e in entries:
        clean.append({k: v for k, v in e.items() if v})
    return json.dumps(clean, ensure_ascii=False, indent=indent)


def format_yaml(entries: list[dict]) -> str:
    """格式化为 YAML 输出"""
    try:
        import yaml
        clean = []
        for e in entries:
            clean.append({k: v for k, v in e.items() if v})
        return yaml.dump(clean, allow_unicode=True, default_flow_style=False, sort_keys=False)
    except ImportError:
        return format_json(entries)


# ──────────────────────────────────────────────
# CLI 入口
# ──────────────────────────────────────────────

def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    
    command = sys.argv[1]
    files = sys.argv[2:]
    
    if command == "detect":
        for fp in files:
            text = Path(fp).read_text(encoding="utf-8", errors="replace")
            fmt = detect_format(text, Path(fp).name)
            result = parse_file(fp)
            print(f"{fp}: {fmt} ({result.get('count', 0)} entries)")
    
    elif command == "parse":
        results = parse_files(files)
        all_entries = merge_results(results)
        print(format_json(all_entries))
    
    elif command == "merge":
        # 合并目录下所有可解析文件
        target_dir = Path(files[0])
        all_results = []
        for f in sorted(target_dir.glob("*")):
            if f.suffix.lower() in (".txt", ".net", ".ris", ".bib"):
                result = parse_file(str(f))
                if result.get("entries"):
                    all_results.append(result)
                    print(f"  [{result['format']:15s}] {f.name:40s} → {result['count']} entries", file=sys.stderr)
        
        all_entries = merge_results(all_results)
        print(f"\nTotal unique entries: {len(all_entries)}", file=sys.stderr)
        print(format_json(all_entries))
    
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == "__main__":
    main()
