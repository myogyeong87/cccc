import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "fs";

function makeSvg(size) {
  const rx = Math.round(size * 0.22);
  const pad = Math.round(size * 0.18);
  const inner = size - pad * 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${rx}" fill="#5C7A3E"/>
  <svg x="${pad}" y="${pad}" width="${inner}" height="${inner}" viewBox="0 0 24 24" fill="none">
    <path d="M9 8v8M12 6v12M15 9v6M6 10v4M18 10v4"
      stroke="white" stroke-width="2.2" stroke-linecap="round"/>
  </svg>
</svg>`;
}

for (const size of [192, 512]) {
  const png = new Resvg(makeSvg(size), { fitTo: { mode: "width", value: size } })
    .render().asPng();
  writeFileSync(`public/pwa-${size}x${size}.png`, png);
  console.log(`✅ pwa-${size}x${size}.png 생성 완료`);
}
