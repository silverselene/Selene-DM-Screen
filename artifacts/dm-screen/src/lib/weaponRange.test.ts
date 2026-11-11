import { describe, expect, it } from "vitest";
import { weaponsData } from "@/data/weapons";
import { UNARMED_STRIKE } from "@/data/unarmedStrike";
import { isRangeProperty, weaponDistance, weaponDistanceShort } from "./weaponRange";

const byName = (n: string) => {
  const w = weaponsData.find((x) => x.name === n);
  if (!w) throw new Error(`no ${n}`);
  return w;
};

describe("weaponDistance", () => {
  it("gives a ranged weapon its range and no reach", () => {
    expect(weaponDistance(byName("Longbow"))).toEqual({ reach: null, range: "150/600" });
    expect(weaponDistanceShort(byName("Longbow"))).toBe("150/600 ft");
  });

  it("gives a thrown melee weapon both, and the short form prefers the range", () => {
    expect(weaponDistance(byName("Dagger"))).toEqual({ reach: 5, range: "20/60" });
    expect(weaponDistanceShort(byName("Dagger"))).toBe("20/60 ft");
  });

  it("gives melee weapons 5 ft reach, 10 ft with the Reach property", () => {
    expect(weaponDistance(byName("Longsword"))).toEqual({ reach: 5, range: null });
    expect(weaponDistanceShort(byName("Glaive"))).toBe("10 ft");
    expect(weaponDistanceShort(UNARMED_STRIKE)).toBe("5 ft");
  });

  it("recognises the range property", () => {
    expect(isRangeProperty("Range 20/60")).toBe(true);
    expect(isRangeProperty("Reach")).toBe(false);
  });
});
