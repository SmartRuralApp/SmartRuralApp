# generate_final_report_v2.py
# Complete 2-pass builder that creates the final major project report DOCX
# strictly matching the reference format (this format.pdf / VTU AJIET standard).
# Clean black-and-white tables, properly scaled images to eliminate blank spaces,
# natural student-level English, and synchronized page numbers via Word COM.

import os
import sys
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml, OxmlElement
from docx.oxml.ns import nsdecls, qn
import win32com.client
import pythoncom
import fitz
import time

# Import structured text data
import report_data_front as rfront
import report_data_chap1_2 as rchap12
import report_data_chap3_4 as rchap34
import report_data_chap5_6 as rchap56
import report_data_chap7_8_ref as rchap78

FIG_DIR = r"c:\MAJOR PROJECT\report_figures"
OUTPUT_FILE = r"c:\MAJOR PROJECT\Smart_Gram_Panchayat_Major_Project_Report.docx"

def set_cell_margins(cell, top=80, bottom=80, left=120, right=120):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def set_cell_shading(cell, color_hex):
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color_hex}"/>')
    cell._tc.get_or_add_tcPr().append(shd)

def set_table_borders(table, color="000000", sz="4", val="single"):
    tblPr = table._tbl.tblPr
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>\n'
        f'  <w:top w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>\n'
        f'  <w:bottom w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>\n'
        f'  <w:insideH w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>\n'
        f'  <w:insideV w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>\n'
        f'  <w:left w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>\n'
        f'  <w:right w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>\n'
        f'</w:tblBorders>'
    )
    tblPr.append(borders)

def setup_section3_header(header):
    hp = header.paragraphs[0]
    hp.text = ""
    hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    hp.paragraph_format.space_before = Pt(0)
    hp.paragraph_format.space_after = Pt(2)
    r_h = hp.add_run("SMART GRAM PANCHAYAT")
    r_h.font.name = "Times New Roman"
    r_h.font.size = Pt(9.5)
    r_h.font.color.rgb = RGBColor(0x33, 0x33, 0x33)
    
    pBdr = parse_xml(r'<w:pBdr %s><w:bottom w:val="single" w:sz="4" w:space="2" w:color="B0B0B0"/></w:pBdr>' % nsdecls('w'))
    hp._p.get_or_add_pPr().append(pBdr)

def setup_section3_footer(footer):
    fp = footer.paragraphs[0]
    fp.text = ""
    ftab = footer.add_table(rows=1, cols=2, width=Inches(6.02))
    ftab.alignment = WD_TABLE_ALIGNMENT.CENTER
    tblPr = ftab._tbl.tblPr
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>\n'
        f'  <w:top w:val="single" w:sz="4" w:space="0" w:color="B0B0B0"/>\n'
        f'  <w:bottom w:val="none"/>\n'
        f'  <w:insideH w:val="none"/>\n'
        f'  <w:insideV w:val="none"/>\n'
        f'  <w:left w:val="none"/>\n'
        f'  <w:right w:val="none"/>\n'
        f'</w:tblBorders>'
    )
    tblPr.append(borders)
    
    c0 = ftab.cell(0, 0)
    c0.width = Inches(5.2)
    p0 = c0.paragraphs[0]
    p0.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p0.paragraph_format.space_before = Pt(2)
    p0.paragraph_format.space_after = Pt(0)
    r0 = p0.add_run("Department of Artificial Intelligence and Data Science, AJIET, Mangaluru")
    r0.font.name = "Times New Roman"
    r0.font.size = Pt(8.5)
    r0.font.color.rgb = RGBColor(0x33, 0x33, 0x33)
    
    c1 = ftab.cell(0, 1)
    c1.width = Inches(0.82)
    p1 = c1.paragraphs[0]
    p1.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    p1.paragraph_format.space_before = Pt(2)
    p1.paragraph_format.space_after = Pt(0)
    fld = parse_xml(r'<w:fldSimple %s w:instr="PAGE"/>' % nsdecls('w'))
    p1._p.append(fld)
    for run in p1.runs:
        run.font.name = "Times New Roman"
        run.font.size = Pt(8.5)

def get_page_number_for(key, page_map, default="1"):
    if not page_map:
        return str(default)
    if key in page_map:
        val = page_map[key]
        return str(val[0] if isinstance(val, list) else val)
    # Prefix match
    for k, v in page_map.items():
        if k.startswith(key):
            return str(v[0] if isinstance(v, list) else v)
    return str(default)

def build_document(page_map=None):
    doc = docx.Document()
    
    # -----------------------------------------------------------------
    # SECTION 1: COVER & CERTIFICATES (Unnumbered, No Header/Footer)
    # -----------------------------------------------------------------
    sec_init = doc.sections[0]
    sec_init.top_margin = Inches(1.0)
    sec_init.bottom_margin = Inches(1.0)
    sec_init.left_margin = Inches(1.25)
    sec_init.right_margin = Inches(1.0)
    sec_init.page_width = Inches(8.27)
    sec_init.page_height = Inches(11.69)
    sec_init.header.paragraphs[0].text = ""
    sec_init.footer.paragraphs[0].text = ""

    # Styles
    style_normal = doc.styles['Normal']
    style_normal.font.name = 'Times New Roman'
    style_normal.font.size = Pt(12)
    style_normal.font.color.rgb = RGBColor(0, 0, 0)
    style_normal.paragraph_format.line_spacing = 1.15
    style_normal.paragraph_format.space_after = Pt(4)

    def add_p(text, bold=False, italic=False, size=12, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_after=4, space_before=0):
        p = doc.add_paragraph()
        p.alignment = align
        p.paragraph_format.space_after = Pt(space_after)
        p.paragraph_format.space_before = Pt(space_before)
        p.paragraph_format.line_spacing = 1.15
        run = p.add_run(text)
        run.bold = bold
        run.italic = italic
        run.font.name = 'Times New Roman'
        run.font.size = Pt(size)
        run.font.color.rgb = RGBColor(0, 0, 0)
        return p

    def add_chap_heading(text):
        doc.add_page_break()
        lines = text.split('\n')
        p1 = doc.add_paragraph()
        p1.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p1.paragraph_format.space_before = Pt(14)
        p1.paragraph_format.space_after = Pt(4)
        p1.paragraph_format.keep_with_next = True
        r1 = p1.add_run(lines[0])
        r1.bold = True
        r1.font.name = 'Times New Roman'
        r1.font.size = Pt(16)
        r1.font.color.rgb = RGBColor(0, 0, 0)
        
        if len(lines) > 1:
            p2 = doc.add_paragraph()
            p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p2.paragraph_format.space_before = Pt(0)
            p2.paragraph_format.space_after = Pt(14)
            p2.paragraph_format.keep_with_next = True
            r2 = p2.add_run(lines[1])
            r2.bold = True
            r2.font.name = 'Times New Roman'
            r2.font.size = Pt(16)
            r2.font.color.rgb = RGBColor(0, 0, 0)

    def add_sec_heading(text):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.space_before = Pt(10)
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.bold = True
        run.font.name = 'Times New Roman'
        run.font.size = Pt(13.5)
        run.font.color.rgb = RGBColor(0, 0, 0)
        return p

    def add_subsec_heading(text):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.space_before = Pt(8)
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.bold = True
        run.font.name = 'Times New Roman'
        run.font.size = Pt(12)
        run.font.color.rgb = RGBColor(0, 0, 0)
        return p

    def add_bullet(text, size=12, space_after=4, space_before=2, indent=0.35):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p.paragraph_format.left_indent = Inches(indent)
        p.paragraph_format.first_line_indent = Inches(-0.2)
        p.paragraph_format.space_after = Pt(space_after)
        p.paragraph_format.space_before = Pt(space_before)
        p.paragraph_format.line_spacing = 1.15
        r_b = p.add_run("•\t")
        r_b.bold = True
        r_b.font.name = 'Times New Roman'
        r_b.font.size = Pt(size)
        r_b.font.color.rgb = RGBColor(0, 0, 0)
        r_t = p.add_run(text)
        r_t.font.name = 'Times New Roman'
        r_t.font.size = Pt(size)
        r_t.font.color.rgb = RGBColor(0, 0, 0)
        return p

    def add_fig_image(fig_filename, width_in=4.2):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(6)
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.keep_with_next = True
        fig_path = os.path.join(FIG_DIR, fig_filename)
        if os.path.exists(fig_path):
            p.add_run().add_picture(fig_path, width=Inches(width_in))
        else:
            p.add_run(f"[FIGURE NOT FOUND: {fig_filename}]").bold = True

    def add_fig_caption(caption_text):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(2)
        p.paragraph_format.space_after = Pt(8)
        run = p.add_run(caption_text)
        run.bold = True
        run.font.name = 'Times New Roman'
        run.font.size = Pt(10.5)
        run.font.color.rgb = RGBColor(0, 0, 0)

    def add_custom_table(table_data, col_widths=None):
        cap = doc.add_paragraph()
        cap.alignment = WD_ALIGN_PARAGRAPH.LEFT
        cap.paragraph_format.space_before = Pt(8)
        cap.paragraph_format.space_after = Pt(3)
        cap.paragraph_format.keep_with_next = True
        r_cap = cap.add_run(table_data["title"])
        r_cap.bold = True
        r_cap.font.name = 'Times New Roman'
        r_cap.font.size = Pt(11)
        r_cap.font.color.rgb = RGBColor(0, 0, 0)

        headers = table_data["headers"]
        rows = table_data["rows"]
        table = doc.add_table(rows=len(rows) + 1, cols=len(headers))
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        set_table_borders(table, color="000000", sz="4")

        hdr_cells = table.rows[0].cells
        for col_idx, h_text in enumerate(headers):
            cell = hdr_cells[col_idx]
            cell.text = h_text
            set_cell_margins(cell, top=100, bottom=100, left=120, right=120)
            set_cell_shading(cell, "F2F2F2")
            for paragraph in cell.paragraphs:
                for run in paragraph.runs:
                    run.bold = True
                    run.font.name = 'Times New Roman'
                    run.font.size = Pt(10)
                    run.font.color.rgb = RGBColor(0, 0, 0)

        for row_idx, row_data in enumerate(rows):
            row_cells = table.rows[row_idx + 1].cells
            for col_idx, val in enumerate(row_data):
                cell = row_cells[col_idx]
                cell.text = str(val)
                set_cell_margins(cell, top=70, bottom=70, left=120, right=120)
                set_cell_shading(cell, "FFFFFF")
                for paragraph in cell.paragraphs:
                    for run in paragraph.runs:
                        run.font.name = 'Times New Roman'
                        run.font.size = Pt(9.5)
                        run.font.color.rgb = RGBColor(0, 0, 0)

        if col_widths and len(col_widths) == len(headers):
            for row in table.rows:
                for col_idx, width in enumerate(col_widths):
                    row.cells[col_idx].width = Inches(width)

        doc.add_paragraph().paragraph_format.space_after = Pt(6)

    def add_code_snippet(title, code_text):
        p_t = doc.add_paragraph()
        p_t.paragraph_format.space_before = Pt(6)
        p_t.paragraph_format.space_after = Pt(2)
        p_t.paragraph_format.keep_with_next = True
        r_t = p_t.add_run(title)
        r_t.bold = True
        r_t.font.name = 'Times New Roman'
        r_t.font.size = Pt(10.5)
        r_t.font.color.rgb = RGBColor(0, 0, 0)

        table = doc.add_table(rows=1, cols=1)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        cell = table.cell(0, 0)
        set_cell_margins(cell, top=80, bottom=80, left=140, right=140)
        set_cell_shading(cell, "F8F8F8")
        set_table_borders(table, color="B0B0B0", sz="4")
        
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.line_spacing = 1.05
        run = p.add_run(code_text)
        run.font.name = 'Consolas'
        run.font.size = Pt(9.0)
        run.font.color.rgb = RGBColor(0x20, 0x20, 0x20)
        cell.width = Inches(5.8)
        doc.add_paragraph().paragraph_format.space_after = Pt(4)

    # =================================================================
    # 1. COVER PAGE
    # =================================================================
    add_p(rfront.UNIVERSITY, bold=True, size=13.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
    add_p(rfront.UNIVERSITY_ADDRESS, size=11, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=10)

    p_vtu = doc.add_paragraph()
    p_vtu.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_vtu.paragraph_format.space_after = Pt(10)
    vtu_logo = os.path.join(FIG_DIR, "image1.png")
    if os.path.exists(vtu_logo):
        p_vtu.add_run().add_picture(vtu_logo, width=Inches(1.1))

    add_p("A Major Project Report On", italic=True, size=11.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=4)
    add_p(f"“{rfront.TITLE}”", bold=True, size=14.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
    add_p(f"({rfront.SUBTITLE})", bold=True, italic=True, size=11, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=10)

    add_p("Submitted in partial fulfillment of the requirements for the award of the degree of", size=10.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
    add_p(rfront.DEGREE, bold=True, size=12.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
    add_p("in", size=10.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
    add_p(rfront.BRANCH, bold=True, size=12, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=10)

    add_p("Submitted by:", bold=True, size=11, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=4)
    st_table = doc.add_table(rows=2, cols=2)
    st_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    st_table.cell(0, 0).text = f"1. {rfront.STUDENTS[0]['name']}  ({rfront.STUDENTS[0]['usn']})"
    st_table.cell(0, 1).text = f"2. {rfront.STUDENTS[1]['name']}  ({rfront.STUDENTS[1]['usn']})"
    st_table.cell(1, 0).text = f"3. {rfront.STUDENTS[2]['name']}  ({rfront.STUDENTS[2]['usn']})"
    st_table.cell(1, 1).text = f"4. {rfront.STUDENTS[3]['name']}  ({rfront.STUDENTS[3]['usn']})"
    for row in st_table.rows:
        for cell in row.cells:
            cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
            cell.paragraphs[0].runs[0].font.name = "Times New Roman"
            cell.paragraphs[0].runs[0].font.size = Pt(10)
            cell.paragraphs[0].runs[0].bold = True

    add_p("Under the Guidance of:", bold=True, size=11, align=WD_ALIGN_PARAGRAPH.CENTER, space_before=8, space_after=2)
    add_p(rfront.GUIDE_NAME, bold=True, size=11.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=1)
    add_p(rfront.GUIDE_DESIGNATION, size=10, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=6)

    p_clg = doc.add_paragraph()
    p_clg.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_clg.paragraph_format.space_after = Pt(6)
    clg_logo = os.path.join(FIG_DIR, "college_logo.png")
    if os.path.exists(clg_logo):
        p_clg.add_run().add_picture(clg_logo, width=Inches(1.15))

    add_p(rfront.DEPARTMENT, bold=True, size=11, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=1)
    add_p(rfront.COLLEGE, bold=True, size=11.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=1)
    add_p(rfront.COLLEGE_SUB, size=9.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=1)
    add_p(rfront.COLLEGE_APPROVAL, size=9, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
    add_p(f"Academic Year: {rfront.ACADEMIC_YEAR}", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=0)

    # =================================================================
    # 2. CERTIFICATES & DECLARATION
    # =================================================================
    doc.add_page_break()
    add_p(rfront.COLLEGE, bold=True, size=12, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=1)
    add_p(rfront.COLLEGE_SUB, size=10, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=1)
    add_p(rfront.COLLEGE_APPROVAL, size=9, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=4)
    add_p(rfront.DEPARTMENT, bold=True, size=11.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=12)
    add_p("DEPARTMENT CERTIFICATE", bold=True, size=13.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=12)
    add_p(rfront.DEPT_CERTIFICATE_TEXT, size=11.5, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_after=24)

    sig_p1 = doc.add_paragraph()
    sig_p1.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    sig_p1.paragraph_format.space_before = Pt(36)
    sig_p1.paragraph_format.space_after = Pt(2)
    r_sig1 = sig_p1.add_run(f"Signature of the Guide & HOD\n({rfront.GUIDE_NAME})\n{rfront.GUIDE_DESIGNATION}\n{rfront.DEPARTMENT}")
    r_sig1.bold = True
    r_sig1.font.size = Pt(10)

    doc.add_page_break()
    add_p(rfront.COLLEGE, bold=True, size=12, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=1)
    add_p(rfront.COLLEGE_SUB, size=10, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=1)
    add_p(rfront.COLLEGE_APPROVAL, size=9, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=4)
    add_p(rfront.DEPARTMENT, bold=True, size=11.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=12)
    add_p("INSTITUTIONAL CERTIFICATE", bold=True, size=13.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=12)
    add_p(rfront.COLLEGE_CERTIFICATE_TEXT, size=11.5, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_after=18)

    sig_tab = doc.add_table(rows=2, cols=2)
    sig_tab.alignment = WD_TABLE_ALIGNMENT.CENTER
    sig_tab.cell(0, 0).text = f"\n\n_______________________\nSignature of the Guide\n({rfront.GUIDE_NAME})"
    sig_tab.cell(0, 1).text = f"\n\n_______________________\nSignature of the HOD\n({rfront.GUIDE_NAME})"
    sig_tab.cell(1, 0).text = f"\n\n_______________________\nSignature of the Principal\n({rfront.PRINCIPAL_NAME})"
    sig_tab.cell(1, 1).text = "\n\n_______________________\nCollege Seal & Date"
    for row in sig_tab.rows:
        for cell in row.cells:
            cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
            cell.paragraphs[0].runs[0].bold = True
            cell.paragraphs[0].runs[0].font.size = Pt(9.5)

    add_p("External Viva-Voce Examination:", bold=True, size=10.5, space_before=14, space_after=4)
    add_p("1. Name of Examiner 1: ____________________________     Signature: __________________  Date: _________", size=10, space_after=3)
    add_p("2. Name of Examiner 2: ____________________________     Signature: __________________  Date: _________", size=10, space_after=10)

    doc.add_page_break()
    add_p("DECLARATION", bold=True, size=13.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=12)
    add_p(rfront.DECLARATION_TEXT, size=11.5, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_after=18)

    add_p("Candidate Signatures:", bold=True, size=10.5, space_before=12, space_after=6)
    cand_tab = doc.add_table(rows=4, cols=3)
    cand_tab.alignment = WD_TABLE_ALIGNMENT.CENTER
    for idx, st in enumerate(rfront.STUDENTS):
        cand_tab.cell(idx, 0).text = f"{idx+1}. {st['name']}"
        cand_tab.cell(idx, 1).text = f"USN: {st['usn']}"
        cand_tab.cell(idx, 2).text = "Signature: ____________________"
        for col in range(3):
            cand_tab.cell(idx, col).paragraphs[0].runs[0].bold = True
            cand_tab.cell(idx, col).paragraphs[0].runs[0].font.size = Pt(9.5)

    # =================================================================
    # SECTION 2: PRELIMINARY PAGES (Roman Numerals, Centered Footer)
    # =================================================================
    sec_prelim = doc.add_section()
    sec_prelim.top_margin = Inches(1.0)
    sec_prelim.bottom_margin = Inches(1.0)
    sec_prelim.left_margin = Inches(1.25)
    sec_prelim.right_margin = Inches(1.0)
    sec_prelim.page_width = Inches(8.27)
    sec_prelim.page_height = Inches(11.69)

    sec_prelim.header.is_linked_to_previous = False
    sec_prelim.footer.is_linked_to_previous = False
    sec_prelim.header.paragraphs[0].text = ""

    sec2_pr = sec_prelim._sectPr
    pgNumType2 = parse_xml(r'<w:pgNumType %s w:fmt="lowerRoman" w:start="1"/>' % nsdecls('w'))
    sec2_pr.append(pgNumType2)

    # Footer for Section 2: centered Roman numeral
    f2 = sec_prelim.footer.paragraphs[0]
    f2.text = ""
    f2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fld2 = parse_xml(r'<w:fldSimple %s w:instr="PAGE"/>' % nsdecls('w'))
    f2._p.append(fld2)
    for r in f2.runs:
        r.font.name = "Times New Roman"
        r.font.size = Pt(10)

    add_p("ACKNOWLEDGMENTS", bold=True, size=13.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=12)
    for ack_p in rfront.ACKNOWLEDGMENTS_TEXT:
        add_p(ack_p, size=11.5, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_after=6)

    add_p("Project Team Members:", bold=True, size=10.5, space_before=8, space_after=3)
    for st in rfront.STUDENTS:
        add_p(f"• {st['name']} ({st['usn']})", bold=True, size=10, space_after=1)

    doc.add_page_break()
    add_p("ABSTRACT", bold=True, size=13.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=12)
    for abs_para in rfront.ABSTRACT_TEXT.split('\n\n'):
        add_p(abs_para, size=11.5, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_after=6)

    # =================================================================
    # 3. TABLE OF CONTENTS
    # =================================================================
    doc.add_page_break()
    add_p("TABLE OF CONTENTS", bold=True, size=13.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=12)
    
    toc_data = [
        ("ACKNOWLEDGMENTS", "", get_page_number_for("ACKNOWLEDGMENTS", page_map, "i")),
        ("ABSTRACT", "", get_page_number_for("ABSTRACT", page_map, "ii")),
        ("TABLE OF CONTENTS", "", get_page_number_for("TABLE OF CONTENTS", page_map, "iii")),
        ("LIST OF FIGURES", "", get_page_number_for("LIST OF FIGURES", page_map, "v")),
        ("LIST OF TABLES", "", get_page_number_for("LIST OF TABLES", page_map, "vi")),
        ("ABBREVIATIONS AND NOMENCLATURE", "", get_page_number_for("ABBREVIATIONS AND NOMENCLATURE", page_map, "vii")),
        ("CHAPTER 1", "INTRODUCTION", get_page_number_for("CHAPTER 1", page_map, "1")),
        ("1.1", "Problem Statement", get_page_number_for("1.1 Problem Statement", page_map, "2")),
        ("1.2", "Objectives", get_page_number_for("1.2 Objectives", page_map, "3")),
        ("1.3", "Scope", get_page_number_for("1.3 Scope", page_map, "5")),
        ("CHAPTER 2", "LITERATURE SURVEY", get_page_number_for("CHAPTER 2", page_map, "7")),
        ("2.1", "Research Gap", get_page_number_for("2.1 Research Gap", page_map, "18")),
        ("2.2", "Overall Summary", get_page_number_for("2.2 Overall Summary", page_map, "18")),
        ("CHAPTER 3", "SYSTEM ANALYSIS", get_page_number_for("CHAPTER 3", page_map, "20")),
        ("3.1", "Existing System", get_page_number_for("3.1 Existing System", page_map, "20")),
        ("3.2", "Drawbacks of Existing System", get_page_number_for("3.2 Drawbacks of Existing System", page_map, "21")),
        ("3.3", "Proposed System", get_page_number_for("3.3 Proposed System", page_map, "22")),
        ("3.4", "Feasibility Analysis", get_page_number_for("3.4 Feasibility Analysis", page_map, "23")),
        ("3.4.1", "Technical Feasibility", get_page_number_for("3.4.1 Technical Feasibility", page_map, "23")),
        ("3.4.2", "Economic Feasibility", get_page_number_for("3.4.2 Economic Feasibility", page_map, "24")),
        ("3.4.3", "Operational Feasibility", get_page_number_for("3.4.3 Operational Feasibility", page_map, "24")),
        ("CHAPTER 4", "SYSTEM DESIGN", get_page_number_for("CHAPTER 4", page_map, "25")),
        ("4.1", "System Architecture", get_page_number_for("4.1 System Architecture", page_map, "25")),
        ("4.2", "Module Description", get_page_number_for("4.2 Module Description", page_map, "27")),
        ("4.3", "Database Design", get_page_number_for("4.3 Database Design", page_map, "29")),
        ("4.4", "Data Flow Analysis", get_page_number_for("4.4 Data Flow Analysis", page_map, "32")),
        ("4.5", "UML Use Case Modeling", get_page_number_for("4.5 UML Use Case Modeling", page_map, "34")),
        ("4.6", "System Workflow & Process Logic", get_page_number_for("4.6 System Workflow & Process Logic", page_map, "35")),
        ("4.7", "Behavioral Modeling & Sequence Analysis", get_page_number_for("4.7 Behavioral Modeling & Sequence Analysis", page_map, "36")),
        ("4.8", "Deployment Architecture", get_page_number_for("4.8 Deployment Architecture", page_map, "37")),
        ("CHAPTER 5", "REQUIREMENT SPECIFICATION", get_page_number_for("CHAPTER 5", page_map, "38")),
        ("5.1", "Hardware Requirements", get_page_number_for("5.1 Hardware Requirements", page_map, "38")),
        ("5.2", "Software Requirements", get_page_number_for("5.2 Software Requirements", page_map, "39")),
        ("5.3", "Functional Requirements", get_page_number_for("5.3 Functional Requirements", page_map, "40")),
        ("5.4", "Non-Functional Requirements", get_page_number_for("5.4 Non-Functional Requirements", page_map, "42")),
        ("CHAPTER 6", "IMPLEMENTATION", get_page_number_for("CHAPTER 6", page_map, "44")),
        ("6.1", "System Working and Runtime Lifecycle", get_page_number_for("6.1 System Working and Runtime Lifecycle", page_map, "44")),
        ("6.2", "Frontend Implementation", get_page_number_for("6.2 Frontend Implementation", page_map, "45")),
        ("6.3", "Backend Implementation", get_page_number_for("6.3 Backend Implementation", page_map, "45")),
        ("6.4", "Database Implementation", get_page_number_for("6.4 Database Implementation", page_map, "46")),
        ("6.5", "Implementation of Core Functional Modules", get_page_number_for("6.5 Implementation of Core Functional Modules", page_map, "46")),
        ("6.5.1", "Module 1: Citizen and Administrator Authentication", get_page_number_for("6.5.1", page_map, "47")),
        ("6.5.2", "Module 2: Tax Assessment and Defaulter Prediction", get_page_number_for("6.5.2", page_map, "47")),
        ("6.5.3", "Module 3: Payment Processing and Receipt Generation", get_page_number_for("6.5.3", page_map, "30")),
        ("6.5.4", "Module 4: Grievance Redressal and Priority Classification", get_page_number_for("6.5.4", page_map, "48")),
        ("6.5.5", "Module 5: Welfare Scheme Recommendation", get_page_number_for("6.5.5", page_map, "48")),
        ("6.5.6", "Module 6: Automated SMS Reminders and Gateway Console", get_page_number_for("6.5.6", page_map, "49")),
        ("6.5.7", "Module 7: Bilingual AI Virtual Assistant", get_page_number_for("6.5.7", page_map, "49")),
        ("6.6", "Database Interaction and Parameterized Queries", get_page_number_for("6.6 Database Interaction and Parameterized Queries", page_map, "50")),
        ("6.7", "Machine Learning Pipeline Implementation", get_page_number_for("6.7 Machine Learning Pipeline Implementation", page_map, "50")),
        ("CHAPTER 7", "RESULTS AND DISCUSSION", get_page_number_for("CHAPTER 7", page_map, "53")),
        ("7.1", "Results", get_page_number_for("7.1 Results", page_map, "53")),
        ("7.1.1", "Tax Defaulter Risk Predictor Evaluation", get_page_number_for("7.1.1 Tax Defaulter Risk Predictor Evaluation", page_map, "53")),
        ("7.1.2", "Grievance Priority Classifier Evaluation", get_page_number_for("7.1.2 Grievance Priority Classifier Evaluation", page_map, "54")),
        ("7.1.3", "Welfare Scheme Eligibility Recommender Evaluation", get_page_number_for("7.1.3 Welfare Scheme Eligibility Recommender Evaluation", page_map, "56")),
        ("7.1.4", "Live System Execution Screenshots", get_page_number_for("7.1.4 Live System Execution Screenshots", page_map, "57")),
        ("7.2", "Discussion", get_page_number_for("7.2 Discussion", page_map, "64")),
        ("CHAPTER 8", "CONCLUSION AND FUTURE SCOPE", get_page_number_for("CHAPTER 8", page_map, "66")),
        ("8.1", "Future Scope", get_page_number_for("8.1 Future Scope", page_map, "66")),
        ("REFERENCES", "", get_page_number_for("REFERENCES", page_map, "68"))
    ]

    t_toc = doc.add_table(rows=len(toc_data) + 1, cols=3)
    t_toc.alignment = WD_TABLE_ALIGNMENT.CENTER
    t_toc.rows[0].cells[0].text = "Section"
    t_toc.rows[0].cells[1].text = "Title"
    t_toc.rows[0].cells[2].text = "Page No."
    t_toc.rows[0].cells[0].width = Inches(1.1)
    t_toc.rows[0].cells[1].width = Inches(4.3)
    t_toc.rows[0].cells[2].width = Inches(0.8)
    set_table_borders(t_toc, color="000000", sz="4")

    for cell in t_toc.rows[0].cells:
        set_cell_shading(cell, "F2F2F2")
        cell.paragraphs[0].runs[0].bold = True
        cell.paragraphs[0].runs[0].font.name = "Times New Roman"
        cell.paragraphs[0].runs[0].font.size = Pt(10)
        cell.paragraphs[0].runs[0].font.color.rgb = RGBColor(0, 0, 0)

    for r_idx, (sec_no, sec_title, p_no) in enumerate(toc_data):
        cells = t_toc.rows[r_idx + 1].cells
        cells[0].text = sec_no
        cells[1].text = sec_title if sec_title else sec_no
        cells[2].text = str(p_no)
        cells[0].width = Inches(1.1)
        cells[1].width = Inches(4.3)
        cells[2].width = Inches(0.8)
        cells[2].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
        is_chap = sec_no.startswith("CHAPTER") or sec_no in ["REFERENCES", "ABSTRACT", "TABLE OF CONTENTS", "LIST OF FIGURES", "LIST OF TABLES", "ABBREVIATIONS AND NOMENCLATURE", "ACKNOWLEDGMENTS"]
        for c in cells:
            set_cell_shading(c, "FFFFFF")
            set_cell_margins(c, top=60, bottom=60, left=100, right=100)
            for p_c in c.paragraphs:
                for r_c in p_c.runs:
                    r_c.font.name = "Times New Roman"
                    r_c.font.size = Pt(9.5)
                    r_c.font.color.rgb = RGBColor(0, 0, 0)
                    if is_chap:
                        r_c.bold = True

    # =================================================================
    # 4. LIST OF FIGURES
    # =================================================================
    doc.add_page_break()
    add_p("LIST OF FIGURES", bold=True, size=13.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=12)
    figs_list = [
        ("Figure 4.1", "System Architecture of Smart Rural App", get_page_number_for("Figure 4.1", page_map, "25")),
        ("Figure 4.2", "Module Architecture of Smart Rural Web Application", get_page_number_for("Figure 4.2", page_map, "27")),
        ("Figure 4.3", "Entity Relationship (ER) Diagram", get_page_number_for("Figure 4.3", page_map, "29")),
        ("Figure 4.4", "Data Flow Diagram – Level 0 (Context Level)", get_page_number_for("Figure 4.4", page_map, "32")),
        ("Figure 4.5", "Data Flow Diagram – Level 1 (Functional Decomposition)", get_page_number_for("Figure 4.5", page_map, "33")),
        ("Figure 4.6", "UML Use Case Diagram of Smart Rural App", get_page_number_for("Figure 4.6", page_map, "34")),
        ("Figure 4.7", "Overall System Workflow Flowchart", get_page_number_for("Figure 4.7", page_map, "35")),
        ("Figure 4.8", "Sequence Diagram for Grievance Redressal", get_page_number_for("Figure 4.8", page_map, "36")),
        ("Figure 4.9", "Deployment Diagram of Smart Rural Web Application", get_page_number_for("Figure 4.9", page_map, "37")),
        ("Figure 7.1", "Multi-Model Evaluation Comparison for Tax Defaulter Prediction", get_page_number_for("Figure 7.1", page_map, "54")),
        ("Figure 7.2", "Multi-Model Evaluation Comparison for Grievance Priority Classification", get_page_number_for("Figure 7.2", page_map, "55")),
        ("Figure 7.3", "Multi-Model Evaluation Comparison for Welfare Scheme Recommendation", get_page_number_for("Figure 7.3", page_map, "57")),
        ("Figure 7.4", "Citizen Portal Landing Page and Quick Access Navigation", get_page_number_for("Figure 7.4", page_map, "57")),
        ("Figure 7.5", "Property Tax Search and Payment Interface", get_page_number_for("Figure 7.5", page_map, "58")),
        ("Figure 7.6", "Public Panchayat Services and Welfare Schemes Catalog", get_page_number_for("Figure 7.6", page_map, "58")),
        ("Figure 7.7", "Citizen Demographic Registration Interface", get_page_number_for("Figure 7.7", page_map, "59")),
        ("Figure 7.8", "Citizen Login Interface with Dual-Credential Authentication", get_page_number_for("Figure 7.8", page_map, "59")),
        ("Figure 7.9", "Citizen Dashboard with AI Scheme Recommendations", get_page_number_for("Figure 7.9", page_map, "60")),
        ("Figure 7.10", "Administrator Secure Login Console", get_page_number_for("Figure 7.10", page_map, "60")),
        ("Figure 7.11", "Master Administrator Dashboard with Revenue & Grievance KPIs", get_page_number_for("Figure 7.11", page_map, "61")),
        ("Figure 7.12", "Tax Assessment Records and ML Defaulter Risk Console", get_page_number_for("Figure 7.12", page_map, "61")),
        ("Figure 7.13", "Grievance Redressal and AI Priority Triage Console", get_page_number_for("Figure 7.13", page_map, "62")),
        ("Figure 7.14", "Machine Learning Model Performance & Retraining Dashboard", get_page_number_for("Figure 7.14", page_map, "62")),
        ("Figure 7.15", "Automated SMS Reminder Console and Gateway Logs", get_page_number_for("Figure 7.15", page_map, "63")),
        ("Figure 7.16", "Citizen Demographics Management Registry", get_page_number_for("Figure 7.16", page_map, "63")),
        ("Figure 7.17", "Welfare Schemes Catalog and Criteria Management Console", get_page_number_for("Figure 7.17", page_map, "64"))
    ]

    t_fig = doc.add_table(rows=len(figs_list) + 1, cols=3)
    t_fig.alignment = WD_TABLE_ALIGNMENT.CENTER
    t_fig.rows[0].cells[0].text = "Figure No."
    t_fig.rows[0].cells[1].text = "Figure Name"
    t_fig.rows[0].cells[2].text = "Page No."
    t_fig.rows[0].cells[0].width = Inches(1.2)
    t_fig.rows[0].cells[1].width = Inches(4.2)
    t_fig.rows[0].cells[2].width = Inches(0.8)
    set_table_borders(t_fig, color="000000", sz="4")

    for cell in t_fig.rows[0].cells:
        set_cell_shading(cell, "F2F2F2")
        cell.paragraphs[0].runs[0].bold = True
        cell.paragraphs[0].runs[0].font.name = "Times New Roman"
        cell.paragraphs[0].runs[0].font.size = Pt(10)
        cell.paragraphs[0].runs[0].font.color.rgb = RGBColor(0, 0, 0)

    for r_idx, (f_no, f_title, p_no) in enumerate(figs_list):
        cells = t_fig.rows[r_idx + 1].cells
        cells[0].text = f_no
        cells[1].text = f_title
        cells[2].text = str(p_no)
        cells[0].width = Inches(1.2)
        cells[1].width = Inches(4.2)
        cells[2].width = Inches(0.8)
        cells[2].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
        for c in cells:
            set_cell_shading(c, "FFFFFF")
            set_cell_margins(c, top=60, bottom=60, left=100, right=100)
            for p_c in c.paragraphs:
                for r_c in p_c.runs:
                    r_c.font.name = "Times New Roman"
                    r_c.font.size = Pt(9.5)
                    r_c.font.color.rgb = RGBColor(0, 0, 0)

    # =================================================================
    # 5. LIST OF TABLES
    # =================================================================
    doc.add_page_break()
    add_p("LIST OF TABLES", bold=True, size=13.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=12)
    tabs_list = [
        ("Table 2.1", "Literature Survey Comparative Matrix", get_page_number_for("Table 2.1", page_map, "16")),
        ("Table 4.1", "Relational Database Schema and Constraints", get_page_number_for("Table 4.1", page_map, "30")),
        ("Table 5.1", "Minimum and Recommended Hardware Specifications", get_page_number_for("Table 5.1", page_map, "38")),
        ("Table 5.2", "Software Technology Stack and Production Dependencies", get_page_number_for("Table 5.2", page_map, "39")),
        ("Table 7.1", "Model Comparison Metrics for Tax Defaulter Risk Prediction", get_page_number_for("Table 7.1", page_map, "54")),
        ("Table 7.2", "Model Comparison Metrics for Grievance Priority Classification", get_page_number_for("Table 7.2", page_map, "55")),
        ("Table 7.3", "Model Comparison Metrics for Welfare Scheme Recommendation", get_page_number_for("Table 7.3", page_map, "56"))
    ]

    t_tab = doc.add_table(rows=len(tabs_list) + 1, cols=3)
    t_tab.alignment = WD_TABLE_ALIGNMENT.CENTER
    t_tab.rows[0].cells[0].text = "Table No."
    t_tab.rows[0].cells[1].text = "Table Name"
    t_tab.rows[0].cells[2].text = "Page No."
    t_tab.rows[0].cells[0].width = Inches(1.2)
    t_tab.rows[0].cells[1].width = Inches(4.2)
    t_tab.rows[0].cells[2].width = Inches(0.8)
    set_table_borders(t_tab, color="000000", sz="4")

    for cell in t_tab.rows[0].cells:
        set_cell_shading(cell, "F2F2F2")
        cell.paragraphs[0].runs[0].bold = True
        cell.paragraphs[0].runs[0].font.name = "Times New Roman"
        cell.paragraphs[0].runs[0].font.size = Pt(10)
        cell.paragraphs[0].runs[0].font.color.rgb = RGBColor(0, 0, 0)

    for r_idx, (t_no, t_title, p_no) in enumerate(tabs_list):
        cells = t_tab.rows[r_idx + 1].cells
        cells[0].text = t_no
        cells[1].text = t_title
        cells[2].text = str(p_no)
        cells[0].width = Inches(1.2)
        cells[1].width = Inches(4.2)
        cells[2].width = Inches(0.8)
        cells[2].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
        for c in cells:
            set_cell_shading(c, "FFFFFF")
            set_cell_margins(c, top=60, bottom=60, left=100, right=100)
            for p_c in c.paragraphs:
                for r_c in p_c.runs:
                    r_c.font.name = "Times New Roman"
                    r_c.font.size = Pt(9.5)
                    r_c.font.color.rgb = RGBColor(0, 0, 0)

    # =================================================================
    # 6. ABBREVIATIONS AND NOMENCLATURE
    # =================================================================
    doc.add_page_break()
    add_p("ABBREVIATIONS AND NOMENCLATURE", bold=True, size=13.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=12)
    abbr_table = {
        "title": "Nomenclature and Acronym Definitions",
        "headers": ["Abbreviation / Acronym", "Full Expanded Form / Definition"],
        "rows": rfront.ABBREVIATIONS
    }
    add_custom_table(abbr_table, col_widths=[2.0, 3.8])

    # =================================================================
    # SECTION 3: MAIN BODY (Chapters 1 to 8 + References)
    # =================================================================
    sec_body = doc.add_section()
    sec_body.top_margin = Inches(1.0)
    sec_body.bottom_margin = Inches(1.0)
    sec_body.left_margin = Inches(1.25)
    sec_body.right_margin = Inches(1.0)
    sec_body.page_width = Inches(8.27)
    sec_body.page_height = Inches(11.69)
    
    # Configure page numbers starting at 1 in decimal
    sec3_pr = sec_body._sectPr
    pgNumType3 = parse_xml(r'<w:pgNumType %s w:fmt="decimal" w:start="1"/>' % nsdecls('w'))
    sec3_pr.append(pgNumType3)
    
    # Unlink header and footer from Section 2
    sec_body.header.is_linked_to_previous = False
    sec_body.footer.is_linked_to_previous = False
    
    setup_section3_header(sec_body.header)
    setup_section3_footer(sec_body.footer)

    # =============================================================
    # CHAPTER 1: INTRODUCTION
    # =============================================================
    # Chapter 1 starts on Page 1 of Section 2 (no extra page break needed)
    lines1 = rchap12.CHAP1_TITLE.split('\n')
    p1 = doc.add_paragraph()
    p1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p1.paragraph_format.space_before = Pt(14)
    p1.paragraph_format.space_after = Pt(4)
    p1.paragraph_format.keep_with_next = True
    r1 = p1.add_run(lines1[0])
    r1.bold = True
    r1.font.name = 'Times New Roman'
    r1.font.size = Pt(16)
    r1.font.color.rgb = RGBColor(0, 0, 0)
    
    p2 = doc.add_paragraph()
    p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p2.paragraph_format.space_before = Pt(0)
    p2.paragraph_format.space_after = Pt(14)
    p2.paragraph_format.keep_with_next = True
    r2 = p2.add_run(lines1[1])
    r2.bold = True
    r2.font.name = 'Times New Roman'
    r2.font.size = Pt(16)
    r2.font.color.rgb = RGBColor(0, 0, 0)

    for p_text in rchap12.CHAP1_INTRO_PARAS:
        add_p(p_text)

    add_sec_heading("1.1 Problem Statement")
    for p_text in rchap12.CHAP1_PROBLEM_STATEMENT:
        add_p(p_text)

    add_sec_heading("1.2 Objectives")
    add_p("The primary objectives of the Smart Rural App – Smart Gram Panchayat System are as follows:")
    for obj_text in rchap12.CHAP1_OBJECTIVES:
        add_bullet(obj_text)

    add_sec_heading("1.3 Scope")
    for p_text in rchap12.CHAP1_SCOPE:
        add_p(p_text)

    # =============================================================
    # CHAPTER 2: LITERATURE SURVEY
    # =============================================================
    add_chap_heading(rchap12.CHAP2_TITLE)
    add_p(rchap12.CHAP2_INTRO)

    for paper in rchap12.PAPERS_REVIEW:
        add_subsec_heading(paper["citation"])
        for p_par in paper["text"].split('\n\n'):
            add_p(p_par)

    add_custom_table(rchap12.CHAP2_COMPARATIVE_TABLE, col_widths=[1.1, 0.5, 1.1, 1.1, 1.0, 1.0])

    add_sec_heading("2.1 Research Gap")
    for gap_text in rchap12.CHAP2_RESEARCH_GAP:
        add_p(gap_text)

    add_sec_heading("2.2 Overall Summary")
    for sum_text in rchap12.CHAP2_OVERALL_SUMMARY:
        add_p(sum_text)

    # =============================================================
    # CHAPTER 3: SYSTEM ANALYSIS
    # =============================================================
    add_chap_heading(rchap34.CHAP3_TITLE)
    add_p(rchap34.CHAP3_INTRO)

    add_sec_heading("3.1 Existing System")
    for p_text in rchap34.CHAP3_EXISTING_SYSTEM:
        add_p(p_text)

    add_sec_heading("3.2 Drawbacks of Existing System")
    add_p("The traditional manual record-keeping approach creates serious operational difficulties for both citizens and Panchayat staff:")
    for d_title, d_text in rchap34.CHAP3_DRAWBACKS:
        add_subsec_heading(d_title)
        add_p(d_text)

    add_sec_heading("3.3 Proposed System")
    for p_text in rchap34.CHAP3_PROPOSED_SYSTEM:
        add_p(p_text)

    add_sec_heading("3.4 Feasibility Analysis")
    add_p("A feasibility study was carried out to ensure that the system can be developed and maintained easily in rural offices:")
    
    add_subsec_heading("3.4.1 Technical Feasibility")
    add_p(rchap34.CHAP3_FEASIBILITY["technical"])

    add_subsec_heading("3.4.2 Economic Feasibility")
    add_p(rchap34.CHAP3_FEASIBILITY["economic"])

    add_subsec_heading("3.4.3 Operational Feasibility")
    add_p(rchap34.CHAP3_FEASIBILITY["operational"])

    # =============================================================
    # CHAPTER 4: SYSTEM DESIGN
    # =============================================================
    add_chap_heading(rchap34.CHAP4_TITLE)
    add_p(rchap34.CHAP4_INTRO)

    add_sec_heading("4.1 System Architecture")
    add_p("The Smart Rural App implements a multi-tier client-server architecture separating the user interface, backend server, database, machine learning scripts, and external SMS services. Figure 4.1 shows the overall system architecture.")
    add_fig_image("fig_4_1_system_architecture.png", width_in=4.4)
    add_fig_caption("Figure 4.1: System Architecture of Smart Rural App")
    add_p("The five functional layers operate as follows:")
    for l_title, l_desc in rchap34.CHAP4_ARCH_LAYERS:
        add_subsec_heading(l_title)
        add_p(l_desc)

    add_sec_heading("4.2 Module Description")
    add_p("The system is divided into eight functional modules. Figure 4.2 presents the module interaction architecture.")
    add_fig_image("fig_4_2_module_architecture.png", width_in=4.3)
    add_fig_caption("Figure 4.2: Module Architecture of Smart Rural Web Application")
    add_p("The functional roles of each module are described below:")
    for m_title, m_desc in rchap34.CHAP4_MODULES:
        add_subsec_heading(m_title)
        add_p(m_desc)

    add_sec_heading("4.3 Database Design")
    add_p("The persistence layer utilizes an SQLite relational database (panchayat.db) to store and manage village records reliably. Figure 4.3 depicts the Entity-Relationship (ER) Diagram showing the database entities and their relationships.")
    add_fig_image("fig_4_3_er_diagram.png", width_in=4.3)
    add_fig_caption("Figure 4.3: Entity Relationship (ER) Diagram")
    add_p("Table 4.1 specifies the relational database schema, primary keys, foreign key constraints, and operational purposes.")
    add_custom_table(rchap34.CHAP4_SCHEMA_TABLE, col_widths=[1.0, 1.0, 1.2, 1.4, 1.2])

    add_sec_heading("4.4 Data Flow Analysis")
    for p_dfd in rchap34.CHAP4_DFD_TEXT:
        add_p(p_dfd)
    add_fig_image("fig_4_4_dfd_level_0.png", width_in=4.0)
    add_fig_caption("Figure 4.4: Data Flow Diagram – Level 0 (Context Level)")
    add_fig_image("fig_4_5_dfd_level_1.png", width_in=4.2)
    add_fig_caption("Figure 4.5: Data Flow Diagram – Level 1 (Functional Decomposition)")

    add_sec_heading("4.5 UML Use Case Modeling")
    add_p(rchap34.CHAP4_UML_TEXT)
    add_fig_image("fig_4_6_use_case_diagram.png", width_in=4.3)
    add_fig_caption("Figure 4.6: UML Use Case Diagram of Smart Rural App")

    add_sec_heading("4.6 System Workflow & Process Logic")
    add_p(rchap34.CHAP4_WORKFLOW_TEXT)
    add_fig_image("fig_4_7_system_workflow_flowchart.png", width_in=4.2)
    add_fig_caption("Figure 4.7: Overall System Workflow Flowchart")

    add_sec_heading("4.7 Behavioral Modeling & Sequence Analysis")
    add_p(rchap34.CHAP4_SEQUENCE_TEXT)
    add_fig_image("fig_4_8_sequence_diagram.png", width_in=4.4)
    add_fig_caption("Figure 4.8: Sequence Diagram for Grievance Redressal")

    add_sec_heading("4.8 Deployment Architecture")
    add_p(rchap34.CHAP4_DEPLOYMENT_TEXT)
    add_fig_image("fig_4_9_deployment_diagram.png", width_in=4.2)
    add_fig_caption("Figure 4.9: Deployment Diagram of Smart Rural Web Application")

    # =============================================================
    # CHAPTER 5: REQUIREMENT SPECIFICATION
    # =============================================================
    add_chap_heading(rchap56.CHAP5_TITLE)
    add_p(rchap56.CHAP5_INTRO)

    add_sec_heading("5.1 Hardware Requirements")
    for p_text in rchap56.CHAP5_HARDWARE_PARAS:
        add_p(p_text)
    add_custom_table(rchap56.CHAP5_HARDWARE_TABLE, col_widths=[1.5, 1.4, 1.4, 1.5])

    add_sec_heading("5.2 Software Requirements")
    for p_text in rchap56.CHAP5_SOFTWARE_PARAS:
        add_p(p_text)
    add_custom_table(rchap56.CHAP5_SOFTWARE_TABLE, col_widths=[1.4, 1.4, 1.2, 1.8])

    add_sec_heading("5.3 Functional Requirements")
    add_p("The functional requirements of the Smart Rural App are defined below:")
    for fr_title, fr_desc in rchap56.CHAP5_FUNCTIONAL_REQS:
        add_subsec_heading(fr_title)
        add_p(fr_desc)

    add_sec_heading("5.4 Non-Functional Requirements")
    add_p("The non-functional requirements and quality constraints governing the system are outlined below:")
    for nfr_title, nfr_desc in rchap56.CHAP5_NON_FUNCTIONAL_REQS:
        add_subsec_heading(nfr_title)
        add_p(nfr_desc)

    # =============================================================
    # CHAPTER 6: IMPLEMENTATION
    # =============================================================
    add_chap_heading(rchap56.CHAP6_TITLE)
    add_p(rchap56.CHAP6_INTRO)

    add_sec_heading("6.1 System Working and Runtime Lifecycle")
    for p_text in rchap56.CHAP6_RUNTIME_LIFECYCLE:
        add_p(p_text)

    add_sec_heading("6.2 Frontend Implementation")
    for p_text in rchap56.CHAP6_FRONTEND_IMPL:
        add_p(p_text)

    add_sec_heading("6.3 Backend Implementation")
    for p_text in rchap56.CHAP6_BACKEND_IMPL:
        add_p(p_text)

    add_sec_heading("6.4 Database Implementation")
    for p_text in rchap56.CHAP6_DATABASE_IMPL:
        add_p(p_text)

    add_sec_heading("6.5 Implementation of Core Functional Modules")
    add_p("The technical implementation of each functional module is described below:")
    for mod in rchap56.CHAP6_MODULES_IMPL:
        add_subsec_heading(f"{mod['num']} {mod['title']}")
        add_p(f"• Purpose: {mod['purpose']}")
        add_p(f"• Input: {mod['input']}")
        add_p(f"• Processing Logic: {mod['processing']}")
        add_p(f"• Output: {mod['output']}")
        add_p(f"• Technologies Used: {mod['tech']}")
        add_p(f"• Module Interfacing: {mod['interaction']}")

    add_sec_heading("6.6 Database Interaction and Parameterized Queries")
    add_p("To prevent SQL injection and ensure reliable data handling, all database operations use parameterized prepared statements. Representative database query functions include:")
    for q_title, q_code in rchap56.CHAP6_QUERIES:
        add_code_snippet(q_title, q_code)

    add_sec_heading("6.7 Machine Learning Pipeline Implementation")
    add_p("The machine learning pipeline handles dataset preparation, model training, and inference for tax defaulter risk and complaint classification:")
    for ml_stage, ml_desc in rchap56.CHAP6_ML_PIPELINE:
        add_subsec_heading(ml_stage)
        add_p(ml_desc)

    # =============================================================
    # CHAPTER 7: RESULTS AND DISCUSSION
    # =============================================================
    add_chap_heading(rchap78.CHAP7_TITLE)
    add_p(rchap78.CHAP7_INTRO)

    add_sec_heading("7.1 Results")
    add_p("The machine learning models were evaluated on holdout test partitions following an 80/20 train/test split. Evaluation metrics including Accuracy, Precision, Recall, and weighted F1-Score were logged to assess performance.")

    add_subsec_heading("7.1.1 Tax Defaulter Risk Predictor Evaluation")
    for p_t in rchap78.CHAP7_TAX_EVAL["text"].split('\n\n'):
        add_p(p_t)
    add_custom_table(rchap78.CHAP7_TAX_EVAL["table"], col_widths=[1.5, 1.0, 1.0, 1.0, 1.3])
    add_fig_image("fig_7_1_tax_defaulter_comparison.png", width_in=4.0)
    add_fig_caption("Figure 7.1: Multi-Model Evaluation Comparison for Tax Defaulter Prediction")

    add_subsec_heading("7.1.2 Grievance Priority Classifier Evaluation")
    for p_t in rchap78.CHAP7_GRIEVANCE_EVAL["text"].split('\n\n'):
        add_p(p_t)
    add_custom_table(rchap78.CHAP7_GRIEVANCE_EVAL["table"], col_widths=[1.5, 1.0, 1.0, 1.0, 1.3])
    add_fig_image("fig_7_2_grievance_priority_comparison.png", width_in=4.0)
    add_fig_caption("Figure 7.2: Multi-Model Evaluation Comparison for Grievance Priority Classification")

    add_subsec_heading("7.1.3 Welfare Scheme Eligibility Recommender Evaluation")
    for p_t in rchap78.CHAP7_SCHEME_EVAL["text"].split('\n\n'):
        add_p(p_t)
    add_custom_table(rchap78.CHAP7_SCHEME_EVAL["table"], col_widths=[1.5, 1.0, 1.0, 1.0, 1.3])
    add_fig_image("fig_7_3_scheme_recommender_comparison.png", width_in=4.0)
    add_fig_caption("Figure 7.3: Multi-Model Evaluation Comparison for Welfare Scheme Recommendation")

    add_subsec_heading("7.1.4 Live System Execution Screenshots")
    add_p("The Smart Rural App was tested live on the local development environment. The following screenshots document the working user interfaces:")
    for sc in rchap78.CHAP7_SCREENSHOTS:
        add_fig_image(sc["file"], width_in=4.0)
        add_fig_caption(f"{sc['fig_num']}: {sc['title']}")
        add_p(sc["desc"])

    add_sec_heading("7.2 Discussion")
    for p_disc in rchap78.CHAP7_DISCUSSION:
        add_p(p_disc)

    # =============================================================
    # CHAPTER 8: CONCLUSION AND FUTURE SCOPE
    # =============================================================
    add_chap_heading(rchap78.CHAP8_TITLE)
    for p_conc in rchap78.CHAP8_CONCLUSION:
        add_p(p_conc, space_after=3, line_spacing=1.08)

    add_sec_heading("8.1 Future Scope")
    add_p("Based on our implementation experience, several valuable enhancements can be added in future versions:", space_after=2, line_spacing=1.08)
    for fs_title, fs_desc in rchap78.CHAP8_FUTURE_SCOPE:
        add_subsec_heading(fs_title)
        add_p(fs_desc, space_after=2, line_spacing=1.08)

    # =============================================================
    # REFERENCES
    # =============================================================
    doc.add_page_break()
    p_ref_head = doc.add_paragraph()
    p_ref_head.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_ref_head.paragraph_format.space_before = Pt(10)
    p_ref_head.paragraph_format.space_after = Pt(8)
    p_ref_head.paragraph_format.keep_with_next = True
    r_rf = p_ref_head.add_run("REFERENCES")
    r_rf.bold = True
    r_rf.font.name = 'Times New Roman'
    r_rf.font.size = Pt(16)
    r_rf.font.color.rgb = RGBColor(0, 0, 0)

    for ref_entry in rchap78.REFERENCES_LIST:
        p_ref = doc.add_paragraph()
        p_ref.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p_ref.paragraph_format.space_after = Pt(3)
        p_ref.paragraph_format.line_spacing = 1.05
        p_ref.paragraph_format.left_indent = Inches(0.35)
        p_ref.paragraph_format.first_line_indent = Inches(-0.35)
        run = p_ref.add_run(ref_entry)
        run.font.name = 'Times New Roman'
        run.font.size = Pt(9.5)
        run.font.color.rgb = RGBColor(0, 0, 0)

    return doc

def to_roman(n):
    try:
        n = int(n)
    except Exception:
        return str(n)
    val = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1]
    syb = ["m", "cm", "d", "cd", "c", "xc", "l", "xl", "x", "ix", "v", "iv", "i"]
    roman_num = ""
    i = 0
    while n > 0 and i < len(val):
        for _ in range(n // val[i]):
            roman_num += syb[i]
            n -= val[i]
        i += 1
    return roman_num

def extract_page_map(doc_path):
    print("Extracting exact page numbers from PDF via PyMuPDF...", flush=True)
    temp_pdf = os.path.abspath(doc_path.replace(".docx", "_temp.pdf"))
    if os.path.exists(temp_pdf):
        try:
            os.remove(temp_pdf)
        except Exception:
            pass

    time.sleep(0.5)
    pythoncom.CoInitialize()
    word = win32com.client.Dispatch('Word.Application')
    word.Visible = False
    word.DisplayAlerts = 0
    wdoc = word.Documents.Open(os.path.abspath(doc_path), ReadOnly=True, AddToRecentFiles=False)
    wdoc.ExportAsFixedFormat(temp_pdf, 17)
    wdoc.Close(False)
    word.Quit()

    doc_pdf = fitz.open(temp_pdf)
    sec2_start = None
    sec3_start = None
    for i, page in enumerate(doc_pdf):
        txt = page.get_text()
        if sec2_start is None and ("DECLARATION" in txt or "ACKNOWLEDGMENTS" in txt):
            sec2_start = i + 1
        if sec3_start is None and "CHAPTER 1" in txt and i > 4:
            sec3_start = i + 1

    def to_roman_local(n):
        val = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1]
        syb = ["m", "cm", "d", "cd", "c", "xc", "l", "xl", "x", "ix", "v", "iv", "i"]
        res = ""
        idx = 0
        while n > 0 and idx < len(val):
            for _ in range(n // val[idx]):
                res += syb[idx]
                n -= val[idx]
            idx += 1
        return res

    pages_info = {}
    for i, page in enumerate(doc_pdf):
        sheet = i + 1
        txt = page.get_text()
        if sec2_start and sheet < sec2_start:
            continue
        elif sec3_start and sheet < sec3_start:
            pg_str = to_roman_local(sheet - sec2_start + 1)
        elif sec3_start:
            pg_str = str(sheet - sec3_start + 1)
        else:
            pg_str = str(sheet)

        lines = [l.strip() for l in txt.split('\n') if l.strip()]
        for l in lines:
            if l.startswith("CHAPTER ") and len(l) < 30:
                if l not in pages_info:
                    pages_info[l] = pg_str
            elif l in ['ABSTRACT', 'ABBREVIATIONS AND NOMENCLATURE', 'REFERENCES', 'ACKNOWLEDGMENTS', 'DECLARATION', 'TABLE OF CONTENTS', 'LIST OF FIGURES', 'LIST OF TABLES']:
                if l not in pages_info:
                    pages_info[l] = pg_str
            elif any(l.startswith(f"{c}.") for c in range(1, 9)):
                if len(l) < 70 and not l.endswith('.'):
                    if l not in pages_info:
                        pages_info[l] = pg_str
            elif l.startswith("Figure ") and ":" in l:
                k = l.split(":")[0].strip()
                if k not in pages_info:
                    pages_info[k] = pg_str
            elif l.startswith("Table ") and ":" in l:
                k = l.split(":")[0].strip()
                if k not in pages_info:
                    pages_info[k] = pg_str

    doc_pdf.close()
    if os.path.exists(temp_pdf):
        try:
            os.remove(temp_pdf)
        except Exception:
            pass

    return pages_info

def main():
    print("=== PASS 1: Generate initial document with preliminary TOC ===", flush=True)
    doc = build_document()
    doc.save(OUTPUT_FILE)
    print(f"Pass 1 saved to: {OUTPUT_FILE}", flush=True)

    print("=== PASS 2: Extract exact page numbers via Word & PDF ===", flush=True)
    page_map = extract_page_map(OUTPUT_FILE)
    print(f"Extracted {len(page_map)} page map entries successfully!", flush=True)

    print("=== PASS 3: Rebuild document with exact synchronized page numbers ===", flush=True)
    doc2 = build_document(page_map)
    doc2.save(OUTPUT_FILE)
    print(f"Pass 3 saved to: {OUTPUT_FILE}", flush=True)

    print("=== PASS 4: Final verification and PDF Export via Word ===", flush=True)
    pdf_output = os.path.abspath(OUTPUT_FILE.replace(".docx", ".pdf"))
    try:
        pythoncom.CoInitialize()
        word = win32com.client.Dispatch('Word.Application')
        word.Visible = False
        word.DisplayAlerts = 0
        doc_final = word.Documents.Open(os.path.abspath(OUTPUT_FILE))
        total_pages = doc_final.ComputeStatistics(2)
        print(f"Total pages in Word: {total_pages}", flush=True)
        doc_final.SaveAs(pdf_output, FileFormat=17)
        print(f"Exported PDF to: {pdf_output}", flush=True)
        doc_final.Close(False)
        word.Quit()
        print("SUCCESS: Final document built and PDF exported successfully!", flush=True)
    except Exception as e:
        print("Final verification note:", e, flush=True)

if __name__ == "__main__":
    main()
