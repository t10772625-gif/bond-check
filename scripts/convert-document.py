"""Convert local document bytes to layout-preserving text. Never use Excel to re-save files."""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

kind, filename = sys.argv[1:3]
warnings = []
lines = []
if kind in ("xlsx", "docx"):
    with zipfile.ZipFile(filename) as archive:
        if sum(entry.file_size for entry in archive.infolist()) > 30 * 1024 * 1024:
            raise ValueError("Expanded document exceeds 30 MB")
        if kind == "docx":
            root = ET.fromstring(archive.read("word/document.xml"))
            ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
            lines = ["".join(node.itertext()) for node in root.findall(".//w:p", ns)]
        else:
            ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
            strings = []
            if "xl/sharedStrings.xml" in archive.namelist():
                root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
                strings = ["".join(node.itertext()) for node in root.findall("s:si", ns)]
            for name in sorted(n for n in archive.namelist() if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", n)):
                root = ET.fromstring(archive.read(name))
                for row in root.findall(".//s:row", ns):
                    values = []
                    for cell in row.findall("s:c", ns):
                        value = cell.find("s:v", ns)
                        text = value.text if value is not None and value.text else ""
                        if cell.get("t") == "s":
                            text = strings[int(text)] if text else ""
                        elif cell.get("t") == "inlineStr":
                            text = "".join(node.text or "" for node in cell.findall(".//s:t", ns))
                        elif cell.get("t") not in ("str", "b", "e") and re.fullmatch(r"\d{1,5}", text):
                            text = text.zfill(6)
                            warnings.append("Short numeric cells were padded; check leading zeros against the official file")
                        values.append(text)
                    lines.append("\t".join(values))
elif kind == "xls":
    import xlrd
    book = xlrd.open_workbook(filename)
    for sheet in book.sheets():
        for row in range(sheet.nrows):
            values = []
            for cell in sheet.row(row):
                if cell.ctype == xlrd.XL_CELL_NUMBER:
                    value = str(int(cell.value)) if cell.value == int(cell.value) else str(cell.value)
                    if re.fullmatch(r"\d{1,5}", value):
                        value = value.zfill(6)
                        warnings.append("Short numeric cells were padded; check leading zeros against the official file")
                else:
                    value = str(cell.value)
                values.append(value)
            lines.append("\t".join(values))
else:
    raise ValueError("Unsupported converter input")
print(json.dumps({"text": "\n".join(lines), "warnings": sorted(set(warnings))}))
