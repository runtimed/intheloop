import { describe, expect, it, vi } from "vitest";
import { AttributionControl, type Map } from "maplibre-gl";

function renderAttribution(customAttribution: string): HTMLElement {
  const control = new AttributionControl({ customAttribution, compact: false });
  const map = {
    style: { tileManagers: {} },
    _getUIString: (key: string) => key,
    getCanvasContainer: () => document.createElement("div"),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as Map;
  const container = control.onAdd(map);
  control.onRemove();
  return container.querySelector(".maplibregl-ctrl-attrib-inner")!;
}

describe("bundled MapLibre attribution sanitizer", () => {
  it("removes adjacent dangerous attributes (CVE-2026-85061)", () => {
    const container = renderAttribution(
      '<details open onload="1" ontoggle="alert(1)"><summary>Attribution</summary></details>'
    );
    const details = container.querySelector("details")!;
    expect(details.hasAttribute("onload")).toBe(false);
    expect(details.hasAttribute("ontoggle")).toBe(false);
    expect(details.hasAttribute("open")).toBe(true);
    expect(details.textContent).toBe("Attribution");
  });

  it("preserves a normal attribution link", () => {
    const html =
      '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
    expect(renderAttribution(html).innerHTML).toBe(html);
  });
});
