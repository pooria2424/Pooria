const path = require("path");
const webpack = require("webpack");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
  mode: "production",

  entry: "./src/app.js",

  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "app.js",
    clean: true,
    publicPath: "/"
  },

  target: "web",

  resolve: {
    extensions: [".js", ".json"],

    fallback: {
      assert: require.resolve("assert/"),
      buffer: require.resolve("buffer/"),
      constants: require.resolve("constants-browserify"),
      crypto: require.resolve("crypto-browserify"),
      os: require.resolve("os-browserify/browser"),
      path: require.resolve("path-browserify"),
      process: require.resolve("process/browser"),
      stream: require.resolve("stream-browserify"),
      util: require.resolve("util/"),
      fs: false,
      net: false,
      tls: false,
      child_process: false
    }
  },

  plugins: [
    new webpack.ProvidePlugin({
      process: "process/browser",
      Buffer: ["buffer", "Buffer"]
    }),

    new CopyPlugin({
      patterns: [
        {
          from: "public",
          to: "."
        }
      ]
    })
  ],

  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: [
              [
                "@babel/preset-env",
                {
                  targets: {
                    browsers: [
                      "last 2 versions",
                      "not dead"
                    ]
                  }
                }
              ]
            ]
          }
        }
      }
    ]
  },

  performance: {
    hints: false
  },

  stats: {
    errorDetails: true
  }
};
