// Configures Babel with Expo defaults so Expo Router transforms are applied.
module.exports = function (api) {
  api.cache(true);

  return {
    presets: [require.resolve("babel-preset-expo")],
  };
};
