import { describe, expect, it } from "vitest";
import { countryNameEs } from "./country-names";

describe("countryNameEs", () => {
  it("translates Natural Earth names to Spanish", () => {
    expect(countryNameEs("Egypt")).toBe("Egipto");
    expect(countryNameEs("Libya")).toBe("Libia");
    expect(countryNameEs("United States of America")).toBe("Estados Unidos");
    expect(countryNameEs("Dem. Rep. Congo")).toBe("República Democrática del Congo");
    expect(countryNameEs("Nowhereland")).toBe("Nowhereland");
  });
});
