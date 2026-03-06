const { createRunOncePlugin, withAndroidManifest } = require("expo/config-plugins");

const PLUGIN_NAME = "with-android16-orientation-compat";
const PLUGIN_VERSION = "1.0.0";
const RESTRICTED_RESIZABILITY_PROPERTY =
  "android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY";

// Finds the generated MainActivity entry inside the Android manifest.
function findMainActivity(application) {
  return application.activity?.find((activity) => {
    const activityName = activity.$["android:name"];
    return activityName === ".MainActivity" || activityName?.endsWith(".MainActivity");
  });
}

// Adds or updates a manifest property on an application or activity node.
function ensureProperty(container) {
  const properties = container.property ?? [];
  const existingProperty = properties.find(
    (property) => property.$["android:name"] === RESTRICTED_RESIZABILITY_PROPERTY
  );

  if (existingProperty) {
    existingProperty.$["android:value"] = "true";
  } else {
    properties.push({
      $: {
        "android:name": RESTRICTED_RESIZABILITY_PROPERTY,
        "android:value": "true",
      },
    });
  }

  container.property = properties;
}

// Ensures Android 16 large-screen compatibility mode keeps the requested orientation.
function withAndroid16OrientationCompat(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];

    if (!application) {
      return config;
    }

    ensureProperty(application);

    const mainActivity = findMainActivity(application);

    if (!mainActivity) {
      return config;
    }

    ensureProperty(mainActivity);
    return config;
  });
}

module.exports = createRunOncePlugin(
  withAndroid16OrientationCompat,
  PLUGIN_NAME,
  PLUGIN_VERSION
);
