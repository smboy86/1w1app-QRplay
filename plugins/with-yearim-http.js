const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

// 예림 미디어 도메인에만 HTTP 접근을 허용하는 Android 설정을 추가한다.
function withYearimHttp(config) {
  config = withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application[0];
    application.$["android:networkSecurityConfig"] =
      "@xml/network_security_config";
    return config;
  });

  return withDangerousMod(config, ["android", async (config) => {
    const xmlDirectory = path.join(
      config.modRequest.platformProjectRoot,
      "app/src/main/res/xml",
    );
    await mkdir(xmlDirectory, { recursive: true });
    await writeFile(
      path.join(xmlDirectory, "network_security_config.xml"),
      `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain>media.yearim.kr</domain>
  </domain-config>
</network-security-config>
`,
    );
    return config;
  }]);
}

module.exports = withYearimHttp;
