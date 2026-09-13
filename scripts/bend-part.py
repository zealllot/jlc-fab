"""用 cadquery 建折弯钣金件并导出 STEP，传到 jlc-bj.com 自动报价。

装：  uv venv && uv pip install cadquery        (会拉 OCP，几百 MB，装一次)
跑：  python bend-part.py

下面是一个槽形件：一块面板，两条长边各内折一段，折边上打一排过孔。
侧板、顶板、抽屉盒体都是这个形状，只是尺寸和孔数不同。
"""

import cadquery as cq
from cadquery import exporters
import zipfile

FACE = 310.0    # 面板宽（折边之间的净宽 + 两个料厚）
FLANGE = 15.0   # 折边高
T = 2.0         # 料厚（内 R = T，外 R = 2T，所以 T=2 → 内 R2 外 R4）
LEN = 1133.0    # 件长
HOLE_R = 5.5 / 2        # 过孔半径，Φ5.5 配 M5
HOLE_OFFSET = 10.0      # 孔心到面板外表面的距离，对准型材槽中心


def channel(length, hole_z):
    """槽形截面沿 Z 拉伸，两条折边上按 hole_z 打过孔。"""
    pts = [(0, 0), (FACE, 0), (FACE, FLANGE), (FACE - T, FLANGE),
           (FACE - T, T), (T, T), (T, FLANGE), (0, FLANGE)]
    p = cq.Workplane("XY").polyline(pts).close().extrude(length)

    # 折弯圆角：外 R = 2×料厚，内 R = 料厚
    mid = length / 2
    for pt, r in [((0, 0, mid), 2 * T), ((T, T, mid), T),
                  ((FACE, 0, mid), 2 * T), ((FACE - T, T, mid), T)]:
        p = p.edges(cq.selectors.NearestToPointSelector(pt)).fillet(r)

    # 两条折边各打一排孔
    for x0 in (-1.0, FACE - T - 1.0):
        for z in hole_z:
            p = p.cut(cq.Workplane("YZ").workplane(offset=x0)
                      .center(HOLE_OFFSET, z).circle(HOLE_R).extrude(T + 2.0))
    return p


# 孔位：两端各留 50mm，中间均分
n_holes = 6
z = [50.0 + i * (LEN - 100.0) / (n_holes - 1) for i in range(n_holes)]

part = channel(LEN, z)
exporters.export(part.val(), "side_panel.step")

# 多个件打包一次传（钣金站接受 zip）
with zipfile.ZipFile("parts.zip", "w", zipfile.ZIP_DEFLATED) as zf:
    zf.write("side_panel.step")

sol = part.val()
bb = sol.BoundingBox()
print("外形 %.0f×%.0f×%.0f" % (bb.xlen, bb.ylen, bb.zlen))
print("重量 %.2f kg（按铝 2.70 g/cm³）" % (sol.Volume() * 2.70e-6))
print("圆柱面 %d 个 = 4 处折弯圆角 + %d 个孔" %
      (len(part.faces("%CYLINDER").vals()), 2 * n_holes))

# 展开料宽 ≈ FACE + 2×FLANGE − 折弯补偿，报价看展开面积时用得上
print("展开约 %.0f × %.0f" % (FACE + 2 * FLANGE - 2 * T, LEN))
