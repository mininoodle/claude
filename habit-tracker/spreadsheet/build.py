import sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter as L
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule, DataBarRule
from openpyxl.chart import BarChart, DoughnutChart, LineChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.chart.shapes import GraphicalProperties
from openpyxl.drawing.line import LineProperties

OUT = sys.argv[1]

NAVY = "1F2433"
NAVY2 = "2E3548"
CREAM = "F4F1EA"
TILE = "E4E0D6"
GREY = "C9C5BB"
MUTED = "8A8678"
WHITE = "FFFFFF"
FONT = "Arial"

MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]
HABITS = ["Wake up at 05:00 ⏰", "Stretching 🧘", "Gym 💪", "Reading / Learning 📖",
          "Day Planning 📅", "Project Work 🎯", "No Alcohol 🚫", "Social Media Detox 🌿",
          "Goal Journaling 📒", "Cold Shower 🚿", "", ""]
NH = len(HABITS)            # 12 habit rows
R0 = 17                     # first habit row
R1 = R0 + NH - 1            # last habit row (28)
DC0, DC1 = 3, 33            # day columns C..AG
DAYS = f"{L(DC0)}{{r}}:{L(DC1)}{{r}}"
GRID = f"$C${R0}:$AG${R1}"
NAMES = f"$B${R0}:$B${R1}"
NHAB = f"SUMPRODUCT(--(LEN({NAMES})>0))"   # named habits only

thin = Side(style="thin", color=GREY)
box = Border(left=thin, right=thin, top=thin, bottom=thin)
wline = Side(style="thin", color="4A5268")


def fill(c):
    return PatternFill("solid", fgColor=c)


def hdr(ws, rng, text, size=10):
    ws.merge_cells(rng)
    c = ws[rng.split(":")[0]]
    c.value = text
    c.font = Font(name=FONT, bold=True, color=WHITE, size=size)
    c.alignment = Alignment(horizontal="center", vertical="center")
    for row in ws[rng]:
        for x in row:
            x.fill = fill(NAVY)


def tile(ws, rng, value, fmt=None, size=12, bold=True):
    ws.merge_cells(rng)
    c = ws[rng.split(":")[0]]
    c.value = value
    c.font = Font(name=FONT, bold=bold, color=NAVY, size=size)
    c.alignment = Alignment(horizontal="center", vertical="center")
    if fmt:
        c.number_format = fmt
    for row in ws[rng]:
        for x in row:
            x.fill = fill(TILE)


def build(ws, mi):
    ws.sheet_view.showGridLines = False
    ws.sheet_properties.tabColor = NAVY
    # background
    for r in range(1, 50):
        for col in range(1, 42):
            ws.cell(r, col).fill = fill(CREAM)
            ws.cell(r, col).font = Font(name=FONT, size=9, color=NAVY)

    ws.column_dimensions["A"].width = 2
    ws.column_dimensions["B"].width = 26
    for col in range(DC0, DC1 + 1):
        ws.column_dimensions[L(col)].width = 3.9
    ws.column_dimensions["AH"].width = 2
    for col, w in zip(["AI", "AJ", "AK", "AL", "AM"], [8, 8, 7, 14, 8]):
        ws.column_dimensions[col].width = w
    for col in ["AN", "AO", "AP", "AQ"]:
        ws.column_dimensions[col].hidden = True
    for r in range(3, 13):
        ws.row_dimensions[r].height = 16
    ws.row_dimensions[2].height = 22

    # ---- title + settings ----
    ws.merge_cells("B2:B3")
    t = ws["B2"]
    t.value = "HABIT TRACKER"
    t.font = Font(name=FONT, bold=True, size=14, color=WHITE)
    t.alignment = Alignment(horizontal="center", vertical="center")
    ws["B2"].fill = fill(NAVY); ws["B3"].fill = fill(NAVY)

    hdr(ws, "B5:B5", "SETTINGS")
    hdr(ws, "B6:B6", "Year", 9)
    yc = ws["B7"]
    yc.value = 2026 if mi == 0 else "=January!$B$7"
    yc.fill = fill(TILE)
    yc.font = Font(name=FONT, bold=True, size=11, color=NAVY if mi else "0000FF")
    yc.alignment = Alignment(horizontal="center")
    hdr(ws, "B8:B8", "Month", 9)
    mc = ws["B9"]
    mc.value = MONTHS[mi]
    mc.fill = fill(TILE)
    mc.font = Font(name=FONT, bold=True, size=11, color="0000FF")
    mc.alignment = Alignment(horizontal="center")
    dvm = DataValidation(type="list", formula1='"' + ",".join(MONTHS) + '"', allow_blank=False)
    ws.add_data_validation(dvm); dvm.add("B9")
    if mi == 0:
        dvy = DataValidation(type="whole", operator="between", formula1="1900", formula2="2200")
        ws.add_data_validation(dvy); dvy.add("B7")

    # helper: month number and days in month (hidden col AO/AP)
    ws["AO2"] = "MonthNo"; ws["AP2"] = "=MATCH($B$9,$AQ$1:$AQ$12,0)"
    for k, m in enumerate(MONTHS):
        ws.cell(k + 1, 43, m)
    ws["AO3"] = "Days"; ws["AP3"] = "=DAY(DATE($B$7,$AP$2+1,0))"
    DAYSN = "$AP$3"

    ws.merge_cells("B10:B12")
    n = ws["B10"]
    n.value = ("How to use: tick the boxes each day; pick Mood (1-10) and Sleep (hrs) "
               "below the grid; rename habits in column B. Blue text = editable.")
    n.font = Font(name=FONT, size=8, italic=True, color=MUTED)
    n.alignment = Alignment(wrap_text=True, vertical="top")

    # ---- grid headers ----
    ws.merge_cells(f"B14:B16")
    h = ws["B14"]
    h.value = "My Habits"
    h.font = Font(name=FONT, bold=True, size=13, color=WHITE)
    h.alignment = Alignment(horizontal="center", vertical="center")
    for r in (14, 15, 16):
        ws.cell(r, 2).fill = fill(NAVY)
    weeks = [(1, 7), (8, 14), (15, 21), (22, 28), (29, 31)]
    for wi, (a, b) in enumerate(weeks):
        hdr(ws, f"{L(DC0 + a - 1)}14:{L(DC0 + b - 1)}14", f"Week {wi + 1}", 9)
    for d in range(1, 32):
        col = DC0 + d - 1
        cl = L(col)
        w = ws.cell(15, col)
        w.value = (f'=IF({d}>{DAYSN},"",CHOOSE(WEEKDAY(DATE($B$7,$AP$2,{d})),'
                   '"Su","Mo","Tu","We","Th","Fr","Sa"))')
        dn = ws.cell(16, col)
        dn.value = f'=IF({d}>{DAYSN},"",{d})'
        for x in (w, dn):
            x.fill = fill(NAVY)
            x.font = Font(name=FONT, bold=True, size=8, color=WHITE)
            x.alignment = Alignment(horizontal="center", vertical="center")
            x.border = Border(left=wline, right=wline, top=wline, bottom=wline)

    # ---- habits + checkbox grid ----
    for i, name in enumerate(HABITS):
        r = R0 + i
        ws.row_dimensions[r].height = 18
        c = ws.cell(r, 2)
        c.value = name if name else None
        c.fill = fill(NAVY)
        c.font = Font(name=FONT, bold=True, size=10, color=WHITE)
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = Border(bottom=wline)
        for col in range(DC0, DC1 + 1):
            x = ws.cell(r, col)
            x.value = False
            x.font = Font(name=FONT, size=7, color=NAVY)
            x.alignment = Alignment(horizontal="center", vertical="center")
            x.border = box
            x.fill = fill(WHITE)
    dvb = DataValidation(type="list", formula1='"TRUE,FALSE"', allow_blank=True)
    ws.add_data_validation(dvb); dvb.add(f"C{R0}:AG{R1}")
    # checked -> navy tint, days after month end -> greyed out
    ws.conditional_formatting.add(
        f"C{R0}:AG{R1}",
        FormulaRule(formula=[f'C$16=""'], fill=fill(GREY), font=Font(color=GREY), stopIfTrue=True))
    ws.conditional_formatting.add(
        f"C{R0}:AG{R1}",
        FormulaRule(formula=[f"C{R0}=TRUE"], fill=fill("D5D9E4"), font=Font(color=NAVY, bold=True), stopIfTrue=True))
    ws.conditional_formatting.add(
        f"C{R0}:AG{R1}",
        FormulaRule(formula=[f"C{R0}=FALSE"], font=Font(color="B8B4AA")))

    # daily % row (also feeds the daily chart)
    rp = R1 + 1  # 29
    lab = ws.cell(rp, 2, "Daily %")
    lab.font = Font(name=FONT, size=8, italic=True, color=MUTED)
    lab.alignment = Alignment(horizontal="right")
    for col in range(DC0, DC1 + 1):
        cl = L(col)
        x = ws.cell(rp, col)
        x.value = (f'=IF(OR({cl}$16="",{NHAB}=0),"",'
                   f'SUMPRODUCT(({NAMES}<>"")*({cl}${R0}:{cl}${R1}=TRUE))/{NHAB})')
        x.number_format = "0%"
        x.font = Font(name=FONT, size=7, color=MUTED)
        x.alignment = Alignment(horizontal="center")
    # daily label row for chart categories (hidden helper row 48: "Su 1")
    for col in range(DC0, DC1 + 1):
        cl = L(col)
        ws.cell(48, col).value = f'=IF({cl}$16="","",{cl}$15)'
    ws.row_dimensions[48].hidden = True

    # ---- wellness ----
    hdr(ws, f"C31:AG31", "Overall Wellness", 9)
    ws.cell(31, 2).fill = fill(NAVY)
    for r, label in ((32, "Mood (1-10)"), (33, "Hours of Sleep")):
        c = ws.cell(r, 2, label)
        c.fill = fill(NAVY)
        c.font = Font(name=FONT, bold=True, size=10, color=WHITE)
        c.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[r].height = 18
        for col in range(DC0, DC1 + 1):
            x = ws.cell(r, col)
            x.border = box
            x.fill = fill(WHITE)
            x.font = Font(name=FONT, size=8, color="0000FF")
            x.alignment = Alignment(horizontal="center", vertical="center")
    dv_mood = DataValidation(type="list", formula1='"1,2,3,4,5,6,7,8,9,10"', allow_blank=True)
    dv_sleep = DataValidation(type="list", formula1='"0,1,2,3,4,5,6,7,8,9,10,11,12"', allow_blank=True)
    ws.add_data_validation(dv_mood); dv_mood.add("C32:AG32")
    ws.add_data_validation(dv_sleep); dv_sleep.add("C33:AG33")
    ws.conditional_formatting.add(
        "C32:AG33", FormulaRule(formula=['C$16=""'], fill=fill(GREY), stopIfTrue=True))

    # ---- right panel: tiles + overall ----
    hdr(ws, "AI2:AJ2", "Goal")
    tile(ws, "AI3:AJ4", f"={NHAB}*{DAYSN}")
    hdr(ws, "AI5:AJ5", "Completed")
    tile(ws, "AI6:AJ7", f'=SUMPRODUCT(({NAMES}<>"")*({GRID}=TRUE))')
    hdr(ws, "AI8:AJ8", "Left")
    tile(ws, "AI9:AJ10", "=AI3-AI6")
    hdr(ws, "AK2:AM2", "Overall Stats")
    tile(ws, "AK3:AM4", "=IF(AI3=0,0,AI6/AI3)", fmt="0%", size=18)
    # donut helpers
    ws["AO5"] = "Completed"; ws["AP5"] = "=AI6"
    ws["AO6"] = "Left"; ws["AP6"] = "=AI9"

    # ---- analysis table ----
    hdr(ws, "AI14:AM15", "Analysis", 12)
    for j, t in enumerate(["Goal", "Actual", "Left", "Progress", "%"]):
        c = ws.cell(16, 35 + j, t)
        c.fill = fill(NAVY)
        c.font = Font(name=FONT, bold=True, size=9, color=WHITE)
        c.alignment = Alignment(horizontal="center")
        c.border = Border(left=wline, right=wline, top=wline, bottom=wline)
    for i in range(NH):
        r = R0 + i
        ws[f"AI{r}"] = f'=IF($B{r}="","",{DAYSN})'
        ws[f"AJ{r}"] = f'=IF($B{r}="","",COUNTIF(C{r}:AG{r},TRUE))'
        ws[f"AK{r}"] = f'=IF($B{r}="","",AI{r}-AJ{r})'
        ws[f"AL{r}"] = f'=IF($B{r}="","",AJ{r}/AI{r})'
        ws[f"AM{r}"] = f'=IF($B{r}="","",AJ{r}/AI{r})'
        ws[f"AN{r}"] = f'=IF($B{r}="",-1,AM{r}-ROW()/100000)'   # rank helper
        for col in ["AI", "AJ", "AK", "AL", "AM"]:
            c = ws[f"{col}{r}"]
            c.fill = fill(TILE)
            c.border = box
            c.font = Font(name=FONT, size=9, color=NAVY, bold=(col == "AM"))
            c.alignment = Alignment(horizontal="center", vertical="center")
        ws[f"AL{r}"].number_format = ';;;'   # bar only
        ws[f"AM{r}"].number_format = "0%"
    ws.conditional_formatting.add(
        f"AL{R0}:AL{R1}",
        DataBarRule(start_type="num", start_value=0, end_type="num", end_value=1,
                    color=NAVY, showValue=True))

    # ---- top 10 ----
    hdr(ws, "AI31:AM31", "TOP 10 HABITS", 11)
    for k in range(1, 11):
        r = 31 + k
        ws.row_dimensions[r].height = 16
        a = ws.cell(r, 35, k)
        ws.merge_cells(f"AJ{r}:AL{r}")
        nm = ws[f"AJ{r}"]
        big = f"LARGE($AN${R0}:$AN${R1},{k})"
        nm.value = f'=IF({big}<0,"",INDEX({NAMES},MATCH({big},$AN${R0}:$AN${R1},0)))'
        pc = ws[f"AM{r}"]
        pc.value = f'=IF(AJ{r}="","",INDEX($AM${R0}:$AM${R1},MATCH({big},$AN${R0}:$AN${R1},0)))'
        pc.number_format = "0%"
        for col in ["AI", "AJ", "AK", "AL", "AM"]:
            ws[f"{col}{r}"].fill = fill(TILE)
        a.font = Font(name=FONT, size=9, color=MUTED)
        a.alignment = Alignment(horizontal="center")
        nm.font = Font(name=FONT, size=10, color=NAVY)
        nm.alignment = Alignment(horizontal="left", indent=1)
        pc.font = Font(name=FONT, size=9, bold=True, color=NAVY)
        pc.alignment = Alignment(horizontal="center")

    # ---- weekly helper (hidden AO/AP 8-12) ----
    for wi, (a, b) in enumerate(weeks):
        r = 8 + wi
        c0, c1 = L(DC0 + a - 1), L(DC0 + b - 1)
        ws[f"AO{r}"] = f"Week {wi + 1}"
        valid = f'COUNTIF({c0}$16:{c1}$16,">0")'
        ws[f"AP{r}"] = (f'=IF(OR({valid}=0,{NHAB}=0),0,'
                        f'SUMPRODUCT(({NAMES}<>"")*({c0}${R0}:{c1}${R1}=TRUE))/({NHAB}*{valid}))')

    # ---- charts ----
    def style_bar(ch):
        ch.legend = None
        ch.gapWidth = 40
        ch.y_axis.scaling.min = 0
        ch.y_axis.scaling.max = 1
        ch.y_axis.majorUnit = 0.25
        ch.y_axis.number_format = "0%"
        ch.y_axis.majorGridlines.spPr = GraphicalProperties(ln=LineProperties(solidFill="DDD8CC"))
        ch.y_axis.delete = False
        ch.x_axis.delete = False
        ch.visible_cells_only = False
        s = ch.series[0]
        s.graphicalProperties.solidFill = NAVY
        s.graphicalProperties.line.solidFill = NAVY

    hdr(ws, "C2:Z2", "Daily Progress")
    daily = BarChart()
    daily.add_data(Reference(ws, min_col=DC0, max_col=DC1, min_row=rp), from_rows=True, titles_from_data=False)
    daily.set_categories(Reference(ws, min_col=DC0, max_col=DC1, min_row=48))
    style_bar(daily)
    daily.height, daily.width = 5.5, 20.2
    ws.add_chart(daily, "C3")

    hdr(ws, "AA2:AG2", "Weekly Progress")
    weekly = BarChart()
    weekly.add_data(Reference(ws, min_col=42, min_row=8, max_row=12), titles_from_data=False)
    weekly.set_categories(Reference(ws, min_col=41, min_row=8, max_row=12))
    style_bar(weekly)
    weekly.height, weekly.width = 5.5, 6.0
    ws.add_chart(weekly, "AA3")

    donut = DoughnutChart(holeSize=60)
    donut.add_data(Reference(ws, min_col=42, min_row=5, max_row=6), titles_from_data=False)
    donut.set_categories(Reference(ws, min_col=41, min_row=5, max_row=6))
    donut.legend = None
    donut.visible_cells_only = False
    from openpyxl.chart.series import DataPoint
    s = donut.series[0]
    for idx, colr in ((0, NAVY), (1, GREY)):
        pt = DataPoint(idx=idx)
        pt.graphicalProperties.solidFill = colr
        pt.graphicalProperties.line.solidFill = CREAM
        s.dPt.append(pt)
    donut.height, donut.width = 4.4, 5.6
    ws.add_chart(donut, "AK5")

    line = LineChart()
    line.add_data(Reference(ws, min_col=2, max_col=DC1, min_row=32), from_rows=True, titles_from_data=True)
    line.add_data(Reference(ws, min_col=2, max_col=DC1, min_row=33), from_rows=True, titles_from_data=True)
    line.set_categories(Reference(ws, min_col=DC0, max_col=DC1, min_row=16))
    line.y_axis.scaling.min = 0
    line.y_axis.scaling.max = 12
    line.y_axis.majorUnit = 2
    line.y_axis.delete = False
    line.x_axis.delete = False
    line.y_axis.majorGridlines.spPr = GraphicalProperties(ln=LineProperties(solidFill="DDD8CC"))
    line.legend.position = "b"
    line.visible_cells_only = False
    ms, ss = line.series
    ms.graphicalProperties.line.solidFill = "5C8A5A"
    ms.graphicalProperties.line.width = 22000
    ms.smooth = True
    ss.graphicalProperties.line.solidFill = NAVY
    ss.graphicalProperties.line.width = 22000
    ss.smooth = True
    line.height, line.width = 5.5, 25.8
    ws.add_chart(line, "C35")

    ws.freeze_panes = "C1"


wb = Workbook()
wb.remove(wb.active)
for i, m in enumerate(MONTHS):
    build(wb.create_sheet(m), i)
wb.active = 9  # October
wb.save(OUT)
print("saved", OUT)
