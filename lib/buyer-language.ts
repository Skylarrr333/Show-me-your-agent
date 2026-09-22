/** Narrow bilingual normalization for independently checking explicit numeric edits. */
export function normalizeBuyerText(message: string) {
  const digits: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const smallNumber = (s: string) => {
    if (s.includes("十")) { const [tens, units] = s.split("十"); return (digits[tens] ?? 1) * 10 + (digits[units] ?? 0); }
    return digits[s] ?? s;
  };
  return message
    .replace(/([一二两三四五六七八九十]+)(?=\s*(?:间|个)?(?:卧室|房|分钟))/g, (_, n: string) => String(smallNumber(n)))
    .replace(/(\d+(?:\.\d+)?)\s*万(?:新币|新元)?/g, (_, n: string) => ` SGD ${Number(n) * 10000} `)
    .replace(/(\d+)\s*(?:间|个)?(?:卧室|房)/g, "$1 bedrooms")
    .replace(/地铁(?:步行|站|距离|走路|最多|不超过|不超|必须|到|需|要|\s)*(\d+)\s*分钟(?:以内|内)?/g, " MRT within $1 minutes ")
    .replace(/不开车|没有车|无车|不驾车/g, " no car ")
    .replace(/安静/g, " quiet ")
    .replace(/公园|慢跑/g, " parks ")
    .replace(/金文泰/g, "Clementi").replace(/女皇镇/g, "Queenstown")
    .replace(/偏好|优先考虑/g, "prefer ");
}
