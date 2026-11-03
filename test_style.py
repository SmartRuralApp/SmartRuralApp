import docx
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls
from docx.shared import Inches, Pt, RGBColor

doc = docx.Document()
table = doc.add_table(rows=2, cols=2)
cell = table.cell(0, 0)
cell.text = 'Header 1'
shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="2E7D32"/>')
cell._tc.get_or_add_tcPr().append(shading)
doc.save('test_table.docx')
print('Table styling test passed!')
