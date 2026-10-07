const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
  entry: "./src/app.js",

  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "app.js",
    clean: true
  },

  target: "web",

  resolve: {
    fallback: {
      fs: false,
      net: false,
      tls: false
    }
  },

  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: "public",
          to: "."
        }
      ]
    })
  ],

  performance: {
    hints: false
  }
};