# build_complete_report.py
# Master builder script for generating the complete final-year B.E. Major Project Report DOCX

import os
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import parse_xml, OxmlElement
from docx.oxml.ns import nsdecls, qn

# Import all structured data modules
import report_data_front as rfront
import report_data_chap1_2 as rchap12
import report_data_chap3_4 as rchap34
import report_data_chap5_6 as rchap56
import report_data_chap7_8_ref as rchap78

FIG_DIR = r"c:\MAJOR PROJECT\report_figures"
OUTPUT_FILE = r"c:\MAJOR PROJECT\Smart_Gram_Panchayat_Major_Project_Report.docx"

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    """Set cell padding in twips."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def set_cell_shading(cell, color_hex):
    """Set background color of a cell."""
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color_hex}"/>')
    cell._tc.get_or_add_tcPr().append(shd)

def set_table_borders(table, color="B0B0B0", sz="4", val="single"):
    """Set subtle table borders."""
    tblPr = table._tbl.tblPr
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>\n'
        f'  <w:top w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>\n'
        f'  <w:bottom w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>\n'
        f'  <w:insideH w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>\n'
        f'  <w:insideV w:val="none"/>\n'
        f'  <w:left w:val="none"/>\n'
        f'  <w:right w:val="none"/>\n'
        f'</w:tblBorders>'
    )
    tblPr.append(borders)

def add_header_footer(doc):
    """Configure running headers and footers."""
    for section in doc.sections:
        section.different_first_page_header_footer = True
        
        # Header
        header = section.header
        hp = header.paragraphs[0]
        hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        hrun = hp.add_run("Smart Gram Panchayat: AI-Enabled Digital Governance and Intelligent Rural Service Delivery")
        hrun.font.name = "Times New Roman"
        hrun.font.size = Pt(8.5)
        hrun.font.italic = True
        hrun.font.color.rgb = RGBColor(0x75, 0x75, 0x75)
        
        # Footer
        footer = section.footer
        fp = footer.paragraphs[0]
        fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        frun = fp.add_run("Department of Artificial Intelligence and Data Science, AJIET, Mangaluru  |  Page ")
        frun.font.name = "Times New Roman"
        frun.font.size = Pt(9)
        frun.font.color.rgb = RGBColor(0x75, 0x75, 0x75)
        
        # Add Page Number field
        fldSimple = OxmlElement('w:fldSimple')
        fldSimple.set(qn('w:instr'), 'PAGE')
        fp._p.append(fldSimple)

def main():
    print("Initiating build of Smart_Gram_Panchayat_Major_Project_Report.docx...")
    doc = docx.Document()
    
    # Configure base section margins (VTU standard: Left 1.25 in for binding, Top/Bottom/Right 1.0 in)
    sec = doc.sections[0]
    sec.top_margin = Inches(1.0)
    sec.bottom_margin = Inches(1.0)
    sec.left_margin = Inches(1.25)
    sec.right_margin = Inches(1.0)
    sec.page_width = Inches(8.27)  # A4
    sec.page_height = Inches(11.69)
    
    # Configure document Normal style
    style_normal = doc.styles['Normal']
    style_normal.font.name = 'Times New Roman'
    style_normal.font.size = Pt(12)
    style_normal.font.color.rgb = RGBColor(0x1A, 0x1A, 0x1A)
    style_normal.paragraph_format.line_spacing = 1.25
    style_normal.paragraph_format.space_after = Pt(6)

    # -------------------------------------------------------------
    # Helper Functions
    # -------------------------------------------------------------
    def add_p(text, bold=False, italic=False, size=12, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_after=6, space_before=0, color=(0x1A, 0x1A, 0x1A)):
        p = doc.add_paragraph()
        p.alignment = align
        p.paragraph_format.space_after = Pt(space_after)
        p.paragraph_format.space_before = Pt(space_before)
        p.paragraph_format.line_spacing = 1.25
        run = p.add_run(text)
        run.bold = bold
        run.italic = italic
        run.font.name = 'Times New Roman'
        run.font.size = Pt(size)
        run.font.color.rgb = RGBColor(*color)
        return p

    def add_chap_heading(text):
        doc.add_page_break()
        lines = text.split('\n')
        # Chapter Number line
        p1 = doc.add_paragraph()
        p1.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p1.paragraph_format.space_before = Pt(18)
        p1.paragraph_format.space_after = Pt(6)
        r1 = p1.add_run(lines[0])
        r1.bold = True
        r1.font.name = 'Times New Roman'
        r1.font.size = Pt(16)
        r1.font.color.rgb = RGBColor(0x1B, 0x36, 0x5D)
        
        # Chapter Title line
        if len(lines) > 1:
            p2 = doc.add_paragraph()
            p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p2.paragraph_format.space_before = Pt(0)
            p2.paragraph_format.space_after = Pt(18)
            r2 = p2.add_run(lines[1])
            r2.bold = True
            r2.font.name = 'Times New Roman'
            r2.font.size = Pt(16)
            r2.font.color.rgb = RGBColor(0x1B, 0x36, 0x5D)

    def add_sec_heading(text):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.space_before = Pt(14)
        p.paragraph_format.space_after = Pt(4)
        run = p.add_run(text)
        run.bold = True
        run.font.name = 'Times New Roman'
        run.font.size = Pt(13.5)
        run.font.color.rgb = RGBColor(0x1B, 0x36, 0x5D)
        return p

    def add_subsec_heading(text):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.space_before = Pt(10)
        p.paragraph_format.space_after = Pt(2)
        run = p.add_run(text)
        run.bold = True
        run.font.name = 'Times New Roman'
        run.font.size = Pt(12)
        run.font.color.rgb = RGBColor(0x2E, 0x55, 0x22)
        return p

    def add_fig_image(fig_filename, width_in=5.4):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(8)
        p.paragraph_format.space_after = Pt(4)
        fig_path = os.path.join(FIG_DIR, fig_filename)
        if os.path.exists(fig_path):
            p.add_run().add_picture(fig_path, width=Inches(width_in))
        else:
            p.add_run(f"[FIGURE NOT FOUND: {fig_filename}]").bold = True

    def add_fig_caption(caption_text):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(2)
        p.paragraph_format.space_after = Pt(10)
        run = p.add_run(caption_text)
        run.bold = True
        run.font.name = 'Times New Roman'
        run.font.size = Pt(11)
        run.font.color.rgb = RGBColor(0x21, 0x21, 0x21)

    def add_custom_table(table_data, col_widths=None):
        # Caption above table
        cap = doc.add_paragraph()
        cap.alignment = WD_ALIGN_PARAGRAPH.LEFT
        cap.paragraph_format.space_before = Pt(12)
        cap.paragraph_format.space_after = Pt(4)
        r_cap = cap.add_run(table_data["title"])
        r_cap.bold = True
        r_cap.font.name = 'Times New Roman'
        r_cap.font.size = Pt(11.5)
        r_cap.font.color.rgb = RGBColor(0x1B, 0x36, 0x5D)

        headers = table_data["headers"]
        rows = table_data["rows"]
        num_rows = len(rows) + 1
        num_cols = len(headers)
        
        table = doc.add_table(rows=num_rows, cols=num_cols)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        set_table_borders(table)

        # Header Row
        hdr_cells = table.rows[0].cells
        for col_idx, h_text in enumerate(headers):
            cell = hdr_cells[col_idx]
            cell.text = h_text
            set_cell_margins(cell, top=120, bottom=120, left=140, right=140)
            set_cell_shading(cell, "2E7D32")
            for paragraph in cell.paragraphs:
                paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
                for run in paragraph.runs:
                    run.bold = True
                    run.font.name = 'Times New Roman'
                    run.font.size = Pt(10)
                    run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

        # Data Rows
        for row_idx, row_data in enumerate(rows):
            row_cells = table.rows[row_idx + 1].cells
            shd_col = "F8FAF8" if row_idx % 2 == 1 else "FFFFFF"
            for col_idx, val in enumerate(row_data):
                cell = row_cells[col_idx]
                cell.text = str(val)
                set_cell_margins(cell, top=80, bottom=80, left=140, right=140)
                set_cell_shading(cell, shd_col)
                for paragraph in cell.paragraphs:
                    paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
                    for run in paragraph.runs:
                        run.font.name = 'Times New Roman'
                        run.font.size = Pt(9.5)
                        run.font.color.rgb = RGBColor(0x21, 0x21, 0x21)

        # Set Column Widths if provided
        if col_widths and len(col_widths) == num_cols:
            for row in table.rows:
                for col_idx, width in enumerate(col_widths):
                    row.cells[col_idx].width = Inches(width)

        doc.add_paragraph().paragraph_format.space_after = Pt(8)

    def add_code_snippet(title, code_text):
        p_t = doc.add_paragraph()
        p_t.paragraph_format.space_before = Pt(8)
        p_t.paragraph_format.space_after = Pt(2)
        r_t = p_t.add_run(title)
        r_t.bold = True
        r_t.font.name = 'Times New Roman'
        r_t.font.size = Pt(11)
        r_t.font.color.rgb = RGBColor(0x1B, 0x36, 0x5D)

        table = doc.add_table(rows=1, cols=1)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        cell = table.cell(0, 0)
        set_cell_margins(cell, top=100, bottom=100, left=160, right=160)
        set_cell_shading(cell, "F4F6F9")
        set_table_borders(table, color="D0D7DE", sz="6")
        
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.line_spacing = 1.05
        run = p.add_run(code_text)
        run.font.name = 'Consolas'
        run.font.size = Pt(9.5)
        run.font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)
        
        cell.width = Inches(5.8)
        doc.add_paragraph().paragraph_format.space_after = Pt(6)

    # =============================================================
    # 1. FRONT MATTER: COVER PAGE
    # =============================================================
    print("Building Front Matter: Cover Page...")
    add_p(rfront.UNIVERSITY, bold=True, size=14, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
    add_p(rfront.UNIVERSITY_ADDRESS, size=11, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=12)

    # VTU Logo
    p_vtu = doc.add_paragraph()
    p_vtu.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_vtu.paragraph_format.space_after = Pt(12)
    vtu_logo = os.path.join(FIG_DIR, "image1.png")
    if os.path.exists(vtu_logo):
        p_vtu.add_run().add_picture(vtu_logo, width=Inches(1.2))

    add_p("A Major Project Report On", italic=True, size=12, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=4)
    add_p(f"“{rfront.TITLE}”", bold=True, size=15, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2, color=(0x1B, 0x36, 0x5D))
    add_p(f"({rfront.SUBTITLE})", bold=True, italic=True, size=11.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=12, color=(0x2E, 0x7D, 0x32))

    add_p("Submitted in partial fulfillment of the requirements for the award of the degree of", size=11, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
    add_p(rfront.DEGREE, bold=True, size=13, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
    add_p("in", size=11, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
    add_p(rfront.BRANCH, bold=True, size=12.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=12)

    # Students & Guide Table
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
            cell.paragraphs[0].runs[0].font.size = Pt(10.5)
            cell.paragraphs[0].runs[0].bold = True

    add_p("Under the Guidance of:", bold=True, size=11, align=WD_ALIGN_PARAGRAPH.CENTER, space_before=10, space_after=2)
    add_p(rfront.GUIDE_NAME, bold=True, size=12, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=1)
    add_p(rfront.GUIDE_DESIGNATION, size=10.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=8)

    # AJIET Logo
    p_clg = doc.add_paragraph()
    p_clg.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_clg.paragraph_format.space_after = Pt(8)
    clg_logo = os.path.join(FIG_DIR, "college_logo.png")
    if os.path.exists(clg_logo):
        p_clg.add_run().add_picture(clg_logo, width=Inches(1.3))

    add_p(rfront.DEPARTMENT, bold=True, size=11.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=1, color=(0x1B, 0x36, 0x5D))
    add_p(rfront.COLLEGE, bold=True, size=12, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=1)
    add_p(rfront.COLLEGE_SUB, size=10, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=1)
    add_p(rfront.COLLEGE_APPROVAL, size=9.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
    add_p(f"Academic Year: {rfront.ACADEMIC_YEAR}", bold=True, size=10.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=0)

    # =============================================================
    # 2. CERTIFICATES & DECLARATION
    # =============================================================
    print("Building Certificates and Declarations...")
    doc.add_page_break()
    add_p(rfront.COLLEGE, bold=True, size=12.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=1)
    add_p(rfront.COLLEGE_SUB, size=10, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=1)
    add_p(rfront.COLLEGE_APPROVAL, size=9, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=6)
    add_p(rfront.DEPARTMENT, bold=True, size=12, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=14, color=(0x1B, 0x36, 0x5D))

    add_p("DEPARTMENT CERTIFICATE", bold=True, size=14, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=14)
    add_p(rfront.DEPT_CERTIFICATE_TEXT, size=11.5, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_after=24)

    sig_p1 = doc.add_paragraph()
    sig_p1.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    sig_p1.paragraph_format.space_before = Pt(40)
    sig_p1.paragraph_format.space_after = Pt(2)
    r_sig1 = sig_p1.add_run(f"Signature of the Guide & HOD\n({rfront.GUIDE_NAME})\n{rfront.GUIDE_DESIGNATION}\n{rfront.DEPARTMENT}")
    r_sig1.bold = True
    r_sig1.font.size = Pt(10.5)

    # Institutional Certificate
    doc.add_page_break()
    add_p(rfront.COLLEGE, bold=True, size=12.5, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=1)
    add_p(rfront.COLLEGE_SUB, size=10, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=1)
    add_p(rfront.COLLEGE_APPROVAL, size=9, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=6)
    add_p(rfront.DEPARTMENT, bold=True, size=12, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=14, color=(0x1B, 0x36, 0x5D))

    add_p("INSTITUTIONAL CERTIFICATE", bold=True, size=14, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=14)
    add_p(rfront.COLLEGE_CERTIFICATE_TEXT, size=11.5, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_after=20)

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
            cell.paragraphs[0].runs[0].font.size = Pt(10)

    add_p("External Viva-Voce Examination:", bold=True, size=11, space_before=16, space_after=6)
    add_p("1. Name of Examiner 1: ____________________________     Signature: __________________  Date: _________", size=10.5, space_after=4)
    add_p("2. Name of Examiner 2: ____________________________     Signature: __________________  Date: _________", size=10.5, space_after=12)

    # Declaration
    doc.add_page_break()
    add_p("DECLARATION", bold=True, size=14, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=14)
    add_p(rfront.DECLARATION_TEXT, size=11.5, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_after=20)

    add_p("Candidate Signatures:", bold=True, size=11, space_before=14, space_after=8)
    cand_tab = doc.add_table(rows=4, cols=3)
    cand_tab.alignment = WD_TABLE_ALIGNMENT.CENTER
    for idx, st in enumerate(rfront.STUDENTS):
        cand_tab.cell(idx, 0).text = f"{idx+1}. {st['name']}"
        cand_tab.cell(idx, 1).text = f"USN: {st['usn']}"
        cand_tab.cell(idx, 2).text = "Signature: ____________________"
        for col in range(3):
            cand_tab.cell(idx, col).paragraphs[0].runs[0].bold = True
            cand_tab.cell(idx, col).paragraphs[0].runs[0].font.size = Pt(10)

    # Acknowledgments
    doc.add_page_break()
    add_p("ACKNOWLEDGMENTS", bold=True, size=14, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=14)
    for ack_p in rfront.ACKNOWLEDGMENTS_TEXT:
        add_p(ack_p, size=11.5, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_after=8)

    add_p("Project Team Members:", bold=True, size=11, space_before=10, space_after=4)
    for st in rfront.STUDENTS:
        add_p(f"• {st['name']} ({st['usn']})", bold=True, size=10.5, space_after=2)

    # Abstract
    doc.add_page_break()
    add_p("ABSTRACT", bold=True, size=14, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=14)
    for abs_para in rfront.ABSTRACT_TEXT.split('\n\n'):
        add_p(abs_para, size=11.5, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_after=8)

    # Abbreviations and Nomenclature
    doc.add_page_break()
    add_p("ABBREVIATIONS AND NOMENCLATURE", bold=True, size=14, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=14)
    abbr_table = {
        "title": "Nomenclature and Acronym Definitions",
        "headers": ["Abbreviation / Acronym", "Full Expanded Form / Definition"],
        "rows": rfront.ABBREVIATIONS
    }
    add_custom_table(abbr_table, col_widths=[2.0, 3.8])

    # =============================================================
    # CHAPTER 1: INTRODUCTION
    # =============================================================
    print("Building Chapter 1: Introduction...")
    add_chap_heading(rchap12.CHAP1_TITLE)
    for p_text in rchap12.CHAP1_INTRO_PARAS:
        add_p(p_text)

    add_sec_heading("1.1 Problem Statement")
    for p_text in rchap12.CHAP1_PROBLEM_STATEMENT:
        add_p(p_text)

    add_sec_heading("1.2 Objectives")
    add_p("The primary objective of the Smart Rural App (Smart Gram Panchayat System) is to architect, develop, and deploy an integrated, full-stack, AI-augmented digital governance platform that systematically digitizes and automates rural local government administration. The specific engineering objectives are formulated as follows:")
    for num_title, body_text in rchap12.CHAP1_OBJECTIVES:
        add_subsec_heading(num_title)
        add_p(body_text)

    add_sec_heading("1.3 Scope")
    for p_text in rchap12.CHAP1_SCOPE:
        add_p(p_text)

    # =============================================================
    # CHAPTER 2: LITERATURE SURVEY
    # =============================================================
    print("Building Chapter 2: Literature Survey...")
    add_chap_heading(rchap12.CHAP2_TITLE)
    add_p(rchap12.CHAP2_INTRO)

    for paper in rchap12.PAPERS_REVIEW:
        add_subsec_heading(paper["citation"])
        for p_par in paper["text"].split('\n\n'):
            add_p(p_par)

    # Comparative Summary Matrix Table
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
    print("Building Chapter 3: System Analysis...")
    add_chap_heading(rchap34.CHAP3_TITLE)
    add_p(rchap34.CHAP3_INTRO)

    add_sec_heading("3.1 Existing System")
    for p_text in rchap34.CHAP3_EXISTING_SYSTEM:
        add_p(p_text)

    add_sec_heading("3.2 Drawbacks of Existing System")
    add_p("The traditional manual record-keeping approach creates severe operational vulnerabilities that compromise administrative integrity and public service delivery:")
    for d_title, d_text in rchap34.CHAP3_DRAWBACKS:
        add_subsec_heading(d_title)
        add_p(d_text)

    add_sec_heading("3.3 Proposed System")
    for p_text in rchap34.CHAP3_PROPOSED_SYSTEM:
        add_p(p_text)

    add_sec_heading("3.4 Feasibility Analysis")
    add_p("A multi-dimensional feasibility study was conducted to ensure the proposed platform can be successfully developed, deployed, and sustained in rural administrative environments:")
    
    add_subsec_heading("3.4.1 Technical Feasibility")
    add_p(rchap34.CHAP3_FEASIBILITY["technical"])

    add_subsec_heading("3.4.2 Economic Feasibility")
    add_p(rchap34.CHAP3_FEASIBILITY["economic"])

    add_subsec_heading("3.4.3 Operational Feasibility")
    add_p(rchap34.CHAP3_FEASIBILITY["operational"])

    # =============================================================
    # CHAPTER 4: SYSTEM DESIGN
    # =============================================================
    print("Building Chapter 4: System Design...")
    add_chap_heading(rchap34.CHAP4_TITLE)
    add_p(rchap34.CHAP4_INTRO)

    add_sec_heading("4.1 System Architecture")
    add_p("The Smart Rural App implements a modular, multi-tier client-server architecture cleanly decoupling user interaction, backend services, persistent data storage, machine learning inference, and cellular telecommunications. Figure 4.1 depicts the overarching system architecture.")
    add_fig_image("fig_4_1_system_architecture.png", width_in=5.6)
    add_fig_caption("Figure 4.1: System Architecture of Smart Rural App")
    add_p("The five tightly integrated functional layers operate as follows:")
    for l_title, l_desc in rchap34.CHAP4_ARCH_LAYERS:
        add_subsec_heading(l_title)
        add_p(l_desc)

    add_sec_heading("4.2 Module Description")
    add_p("The system is decomposed into eight specialized, decoupled functional modules. Figure 4.2 presents the module interaction architecture.")
    add_fig_image("fig_4_2_module_architecture.png", width_in=5.4)
    add_fig_caption("Figure 4.2: Module Architecture of Smart Rural Web Application")
    add_p("The functional specifications for each module are detailed below:")
    for m_title, m_desc in rchap34.CHAP4_MODULES:
        add_subsec_heading(m_title)
        add_p(m_desc)

    add_sec_heading("4.3 Database Design")
    add_p("The persistence layer utilizes an ACID-compliant relational SQLite database (panchayat.db) designed to guarantee strict referential integrity, eliminate duplicate records, and optimize high-concurrency queries. Figure 4.3 depicts the Entity-Relationship (ER) Diagram modeling all twelve primary entities and their relational foreign key mappings.")
    add_fig_image("fig_4_3_er_diagram.png", width_in=5.4)
    add_fig_caption("Figure 4.3: Entity Relationship (ER) Diagram")
    add_p("Table 4.1 specifies the complete relational database schema, primary keys, foreign key constraints, and operational purposes.")
    add_custom_table(rchap34.CHAP4_SCHEMA_TABLE, col_widths=[1.0, 1.0, 1.2, 1.4, 1.2])

    add_sec_heading("4.4 Data Flow Analysis")
    for p_dfd in rchap34.CHAP4_DFD_TEXT:
        add_p(p_dfd)
    add_fig_image("fig_4_4_dfd_level_0.png", width_in=4.8)
    add_fig_caption("Figure 4.4: Data Flow Diagram – Level 0 (Context Level)")
    add_fig_image("fig_4_5_dfd_level_1.png", width_in=5.0)
    add_fig_caption("Figure 4.5: Data Flow Diagram – Level 1 (Functional Decomposition)")

    add_sec_heading("4.5 UML Use Case Modeling")
    add_p(rchap34.CHAP4_UML_TEXT)
    add_fig_image("fig_4_6_use_case_diagram.png", width_in=5.2)
    add_fig_caption("Figure 4.6: UML Use Case Diagram of Smart Rural App")

    add_sec_heading("4.6 System Workflow & Process Logic")
    add_p(rchap34.CHAP4_WORKFLOW_TEXT)
    add_fig_image("fig_4_7_system_workflow_flowchart.png", width_in=5.2)
    add_fig_caption("Figure 4.7: Overall System Workflow Flowchart")

    add_sec_heading("4.7 Behavioral Modeling & Sequence Analysis")
    add_p(rchap34.CHAP4_SEQUENCE_TEXT)
    add_fig_image("fig_4_8_sequence_diagram.png", width_in=5.5)
    add_fig_caption("Figure 4.8: Sequence Diagram for Grievance Redressal & AI Prioritization")

    add_sec_heading("4.8 Deployment Architecture")
    add_p(rchap34.CHAP4_DEPLOYMENT_TEXT)
    add_fig_image("fig_4_9_deployment_diagram.png", width_in=5.2)
    add_fig_caption("Figure 4.9: Deployment Diagram of Smart Rural Web Application")

    # =============================================================
    # CHAPTER 5: REQUIREMENT SPECIFICATION
    # =============================================================
    print("Building Chapter 5: Requirement Specification...")
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
    add_p("The platform's functional mandates are formally specified below:")
    for fr_title, fr_desc in rchap56.CHAP5_FUNCTIONAL_REQS:
        add_subsec_heading(fr_title)
        add_p(fr_desc)

    add_sec_heading("5.4 Non-Functional Requirements")
    add_p("Quality parameters and operational constraints governing the system are defined below:")
    for nfr_title, nfr_desc in rchap56.CHAP5_NON_FUNCTIONAL_REQS:
        add_subsec_heading(nfr_title)
        add_p(nfr_desc)

    # =============================================================
    # CHAPTER 6: IMPLEMENTATION
    # =============================================================
    print("Building Chapter 6: Implementation...")
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
    add_p("Technical implementation details for each core module are structured below:")
    for mod in rchap56.CHAP6_MODULES_IMPL:
        add_subsec_heading(f"{mod['num']} {mod['title']}")
        add_p(f"• Purpose: {mod['purpose']}")
        add_p(f"• Input: {mod['input']}")
        add_p(f"• Processing Logic: {mod['processing']}")
        add_p(f"• Output: {mod['output']}")
        add_p(f"• Technologies Used: {mod['tech']}")
        add_p(f"• Module Interfacing: {mod['interaction']}")

    add_sec_heading("6.6 Database Interaction and Parameterized Queries")
    add_p("To eliminate SQL injection vulnerabilities and guarantee high execution throughput, all database operations use parameterized prepared statements. Representative implementations from database.js and server.js include:")
    for q_title, q_code in rchap56.CHAP6_QUERIES:
        add_code_snippet(q_title, q_code)

    add_sec_heading("6.7 Machine Learning Pipeline Implementation")
    add_p("The machine learning architecture is implemented in ml/train.py and ml/predict.py. The pipeline handles data preparation, algorithm benchmarking, model selection, serialization, and Explainable AI generation:")
    for ml_stage, ml_desc in rchap56.CHAP6_ML_PIPELINE:
        add_subsec_heading(ml_stage)
        add_p(ml_desc)

    # =============================================================
    # CHAPTER 7: RESULTS AND DISCUSSION
    # =============================================================
    print("Building Chapter 7: Results and Discussion...")
    add_chap_heading(rchap78.CHAP7_TITLE)
    add_p(rchap78.CHAP7_INTRO)

    add_sec_heading("7.1 Results")
    add_p("The three machine learning models were systematically evaluated on isolated 20% holdout test partitions following 80/20 train/test splitting. Standard classification metrics—Accuracy, Precision, Recall, and weighted F1-Score—were logged in models/metadata.json to benchmark algorithmic performance.")

    # 7.1.1 Tax Defaulter
    add_subsec_heading("7.1.1 Tax Defaulter Risk Predictor Evaluation")
    for p_t in rchap78.CHAP7_TAX_EVAL["text"].split('\n\n'):
        add_p(p_t)
    add_custom_table(rchap78.CHAP7_TAX_EVAL["table"], col_widths=[1.5, 1.0, 1.0, 1.0, 1.3])
    add_fig_image("fig_7_1_tax_defaulter_comparison.png", width_in=5.2)
    add_fig_caption("Figure 7.1: Multi-Model Evaluation Comparison for Tax Defaulter Prediction")

    # 7.1.2 Grievance Priority
    add_subsec_heading("7.1.2 Grievance Priority Classifier Evaluation")
    for p_t in rchap78.CHAP7_GRIEVANCE_EVAL["text"].split('\n\n'):
        add_p(p_t)
    add_custom_table(rchap78.CHAP7_GRIEVANCE_EVAL["table"], col_widths=[1.5, 1.0, 1.0, 1.0, 1.3])
    add_fig_image("fig_7_2_grievance_priority_comparison.png", width_in=5.2)
    add_fig_caption("Figure 7.2: Multi-Model Evaluation Comparison for Grievance Priority Classification")

    # 7.1.3 Welfare Scheme
    add_subsec_heading("7.1.3 Welfare Scheme Eligibility Recommender Evaluation")
    for p_t in rchap78.CHAP7_SCHEME_EVAL["text"].split('\n\n'):
        add_p(p_t)
    add_custom_table(rchap78.CHAP7_SCHEME_EVAL["table"], col_widths=[1.5, 1.0, 1.0, 1.0, 1.3])
    add_fig_image("fig_7_3_scheme_recommender_comparison.png", width_in=5.2)
    add_fig_caption("Figure 7.3: Multi-Model Evaluation Comparison for Welfare Scheme Recommendation")

    # 7.1.4 Live Screenshots
    add_subsec_heading("7.1.4 Live System Execution Screenshots")
    add_p("The Smart Rural App was executed live on the development server, rigorously verifying all citizen and administrative interfaces. The following high-resolution screenshots document the working system:")
    for sc in rchap78.CHAP7_SCREENSHOTS:
        add_fig_image(sc["file"], width_in=5.4)
        add_fig_caption(f"{sc['fig_num']}: {sc['title']}")
        add_p(sc["desc"])

    add_sec_heading("7.2 Discussion")
    for p_disc in rchap78.CHAP7_DISCUSSION:
        add_p(p_disc)

    # =============================================================
    # CHAPTER 8: CONCLUSION AND FUTURE SCOPE
    # =============================================================
    print("Building Chapter 8: Conclusion and Future Scope...")
    add_chap_heading(rchap78.CHAP8_TITLE)
    for p_conc in rchap78.CHAP8_CONCLUSION:
        add_p(p_conc)

    add_sec_heading("8.1 Future Scope")
    add_p("Building upon the solid architectural and operational foundation established in this major project, several compelling avenues for future enhancement are identified:")
    for fs_title, fs_desc in rchap78.CHAP8_FUTURE_SCOPE:
        add_subsec_heading(fs_title)
        add_p(fs_desc)

    # =============================================================
    # REFERENCES
    # =============================================================
    print("Building References...")
    doc.add_page_break()
    p_ref_head = doc.add_paragraph()
    p_ref_head.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_ref_head.paragraph_format.space_before = Pt(18)
    p_ref_head.paragraph_format.space_after = Pt(18)
    r_rf = p_ref_head.add_run("REFERENCES")
    r_rf.bold = True
    r_rf.font.name = 'Times New Roman'
    r_rf.font.size = Pt(16)
    r_rf.font.color.rgb = RGBColor(0x1B, 0x36, 0x5D)

    for ref_entry in rchap78.REFERENCES_LIST:
        p_ref = doc.add_paragraph()
        p_ref.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p_ref.paragraph_format.space_after = Pt(6)
        p_ref.paragraph_format.line_spacing = 1.15
        p_ref.paragraph_format.left_indent = Inches(0.4)
        p_ref.paragraph_format.first_line_indent = Inches(-0.4)
        run = p_ref.add_run(ref_entry)
        run.font.name = 'Times New Roman'
        run.font.size = Pt(10.5)

    # Configure Running Headers & Footers across document
    print("Configuring running headers and footers...")
    add_header_footer(doc)

    # Save final DOCX document
    print(f"Saving final completed major project report to: {OUTPUT_FILE}...")
    doc.save(OUTPUT_FILE)
    print("SUCCESS: Major project report generation complete!")

if __name__ == "__main__":
    main()
