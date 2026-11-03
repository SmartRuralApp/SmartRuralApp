# test_toc_render.py
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

doc = docx.Document()
sec = doc.sections[0]
sec.top_margin = Inches(1.0)
sec.bottom_margin = Inches(1.0)
sec.left_margin = Inches(1.25)
sec.right_margin = Inches(1.0)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("TABLE OF CONTENTS")
r.bold = True
r.font.name = 'Times New Roman'
r.font.size = Pt(14)
r.font.color.rgb = RGBColor(0x1B, 0x36, 0x5D)

table = doc.add_table(rows=1, cols=3)
table.alignment = WD_TABLE_ALIGNMENT.CENTER
tblPr = table._tbl.tblPr
tblPr.append(parse_xml(f'<w:tblBorders {nsdecls("w")}><w:top w:val="none"/><w:left w:val="none"/><w:right w:val="none"/><w:bottom w:val="single" w:sz="6" w:space="0" w:color="2E7D32"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders>'))

# Header
r0 = table.rows[0].cells
r0[0].text = "Section"
r0[1].text = "Title"
r0[2].text = "Page No."
r0[0].width = Inches(1.0)
r0[1].width = Inches(4.3)
r0[2].width = Inches(0.9)

for cell in r0:
    for par in cell.paragraphs:
        for run in par.runs:
            run.bold = True
            run.font.name = "Times New Roman"
            run.font.size = Pt(10.5)

# Add sample row
r1 = table.add_row().cells
r1[0].text = "1.1"
r1[1].text = "Problem Statement ......................................................................"
r1[2].text = "10"
r1[2].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT

doc.save("test_toc.docx")
print("TOC test saved!")
