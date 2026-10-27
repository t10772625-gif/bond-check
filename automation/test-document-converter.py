import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]


class DocumentConverterTest(unittest.TestCase):
    def run_document(self, kind, files):
        temporary_root = ROOT / ".verification"
        temporary_root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="converter-", dir=temporary_root) as directory:
            self.assertTrue(Path(directory).resolve().is_relative_to(temporary_root.resolve()))
            filename = Path(directory) / ("fixture." + kind)
            with zipfile.ZipFile(filename, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for name, data in files.items():
                    archive.writestr(name, data)
            return subprocess.run(
                [sys.executable, str(ROOT / "scripts/convert-document.py"), kind, str(filename)],
                capture_output=True, text=True, check=False,
            )

    def test_excel_strings_stay_exact_and_short_numeric_cells_are_flagged(self):
        result = self.run_document("xlsx", {
            "xl/sharedStrings.xml": '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>000381</t></si></sst>',
            "xl/worksheets/sheet1.xml": '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row><c t="s"><v>0</v></c><c><v>7447</v></c><c t="inlineStr"><is><t>007448</t></is></c></row></sheetData></worksheet>',
        })
        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        self.assertEqual(output["text"], "000381\t007447\t007448")
        self.assertTrue(any("numeric cells" in warning for warning in output["warnings"]))

    def test_word_keeps_prize_headings_and_zero_prefixed_tokens(self):
        result = self.run_document("docx", {"word/document.xml":
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>First Prize</w:t></w:r></w:p><w:p><w:r><w:t>000381</w:t></w:r></w:p></w:body></w:document>'})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["text"], "First Prize\n000381")

    def test_expanded_zip_limit_is_enforced(self):
        result = self.run_document("xlsx", {"oversized.xml": "0" * (30 * 1024 * 1024 + 1)})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("exceeds 30 MB", result.stderr)


if __name__ == "__main__":
    unittest.main()
