// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2021 NI Rui <ranqus@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

const webpack = require("webpack"),
  { spawn } = require("child_process"),
  path = require("path"),
  os = require("os"),
  HtmlWebpackPlugin = require("html-webpack-plugin"),
  MiniCssExtractPlugin = require("mini-css-extract-plugin"),
  CssMinimizerPlugin = require("css-minimizer-webpack-plugin"),
  ImageMinimizerPlugin = require("image-minimizer-webpack-plugin"),
  { VueLoaderPlugin } = require("vue-loader"),
  FaviconsWebpackPlugin = require("favicons-webpack-plugin"),
  CopyPlugin = require("copy-webpack-plugin"),
  TerserPlugin = require("terser-webpack-plugin"),
  { CleanWebpackPlugin } = require("clean-webpack-plugin");

const inDevMode = process.env.NODE_ENV === "development";

process.traceDeprecation = true;

let appSpawnProc = null,
  appBuildProc = null;

const killSpawnProc = (proc, then) => {
  if (proc === null) {
    then();

    return;
  }

  process.stdout.write("Shutdown application ...\n");

  process.kill(-proc.proc.pid, "SIGINT");

  let forceKill = setTimeout(() => {
    process.kill(-proc.proc.pid);
  }, 3000);

  proc.waiter.then(() => {
    clearTimeout(forceKill);

    then();
  });
};

const startAppSpawnProc = (onExit) => {
  killSpawnProc(appSpawnProc, () => {
    let mEnv = {};

    for (let i in process.env) {
      mEnv[i] = process.env[i];
    }

    mEnv["SSHWIFTY_CONFIG"] = path.join(
      __dirname,
      "sshwifty.conf.example.json"
    );

    mEnv["SSHWIFTY_DEBUG"] = "_";

    process.stdout.write("Starting application ...\n");

    let proc = spawn("go", ["run", "sshwifty.go"], {
        env: mEnv,
        detached: true,
      }),
      waiter = new Promise((resolve) => {
        let closed = false;

        proc.stdout.on("data", (msg) => {
          process.stdout.write(msg.toString());
        });

        proc.stderr.on("data", (msg) => {
          process.stderr.write(msg.toString());
        });

        proc.on("exit", (n) => {
          process.stdout.write("Application process is exited.\n");

          if (closed) {
            return;
          }

          closed = true;

          appSpawnProc = null;
          resolve(n);

          onExit();
        });
      });

    appSpawnProc = {
      proc,
      waiter,
    };
  });
};

const startBuildSpawnProc = (onExit) => {
  killSpawnProc(appBuildProc, () => {
    let mEnv = {};

    for (let i in process.env) {
      mEnv[i] = process.env[i];
    }

    mEnv["NODE_ENV"] = process.env.NODE_ENV;

    process.stdout.write("Generating source code ...\n");

    let proc = spawn("go", ["generate", "./..."], {
        env: mEnv,
        detached: true,
      }),
      waiter = new Promise((resolve) => {
        let closed = false;

        proc.stdout.on("data", (msg) => {
          process.stdout.write(msg.toString());
        });

        proc.stderr.on("data", (msg) => {
          process.stderr.write(msg.toString());
        });

        proc.on("exit", (n) => {
          process.stdout.write("Code generation process is exited.\n");

          if (closed) {
            return;
          }

          closed = true;

          appBuildProc = null;
          resolve(n);

          onExit();
        });
      });

    appBuildProc = {
      proc,
      waiter,
    };
  });
};

const killAllProc = () => {
  if (appBuildProc !== null) {
    killSpawnProc(appBuildProc, () => {
      killSpawnProc(appSpawnProc, () => {
        process.exit(0);
      });
    });

    return;
  }

  killSpawnProc(appSpawnProc, () => {
    process.exit(0);
  });
};

process.on("SIGTERM", killAllProc);
process.on("SIGINT", killAllProc);

module.exports = {
  entry: {
    app: path.join(__dirname, "ui", "app.js"),
  },
  devtool: inDevMode ? "inline-source-map" : "source-map",
  output: {
    publicPath: "/sshwifty/assets/",
    path: path.join(__dirname, ".tmp", "dist"),
    filename: "[contenthash].js",
  },
  resolve: {
    alias: {
      vue$: "vue/dist/vue.esm.js",
    },
  },
  optimization: {
    nodeEnv: process.env.NODE_ENV,
    concatenateModules: true,
    runtimeChunk: true,
    mergeDuplicateChunks: true,
    flagIncludedChunks: true,
    providedExports: true,
    usedExports: true,
    splitChunks: inDevMode
      ? false
      : {
          chunks: "all",
          minSize: 102400,
          maxSize: 244000,
          maxAsyncRequests: 6,
          maxInitialRequests: 6,
          name: false,
        },
    minimize: !inDevMode,
    minimizer: inDevMode
      ? []
      : [
          new CssMinimizerPlugin(),
          new TerserPlugin({
            test: /\.js(\?.*)?$/i,
            terserOptions: {
              ecma: undefined,
              parse: {},
              compress: {},
              mangle: true,
              module: false,
            },
            extractComments: /^\**!|@preserve|@license|@cc_on/i,
          }),
        ],
  },
  module: {
    rules: [
      {
        test: /\.vue$/,
        use: "vue-loader",
      },
      {
        test: /\.css$/,
        use: [
          inDevMode ? "vue-style-loader" : MiniCssExtractPlugin.loader,
          "css-loader",
        ],
      },
      {
        test: /\.html$/,
        use: "html-loader",
      },
      {
        test: /\.(woff(2)?|ttf|eot)(\?v=\d+\.\d+\.\d+)?$/,
        use: "file-loader",
      },
      {
        test: /\.(jpe?g|png|gif|svg)$/i,
        type: "asset",
      },
      {
        test: /\.js$/,
        exclude: /(node_modules)/,
        use: "babel-loader",
      },
    ],
  },
  plugins: (function () {
    var plugins = [
      new webpack.DefinePlugin(
        process.env.NODE_ENV === "production"
          ? {
              "process.env": {
                NODE_ENV: JSON.stringify(process.env.NODE_ENV),
              },
            }
          : {}
      ),
      new webpack.LoaderOptionsPlugin({
        options: {
          handlebarsLoader: {},
        },
      }),
      new CopyPlugin({
        patterns: [
          {
            from: path.join(__dirname, "ui", "robots.txt"),
            to: path.join(__dirname, ".tmp", "dist"),
          },
          {
            from: path.join(__dirname, "README.md"),
            to: path.join(__dirname, ".tmp", "dist"),
          },
          {
            from: path.join(__dirname, "DEPENDENCIES.md"),
            to: path.join(__dirname, ".tmp", "dist"),
          },
          {
            from: path.join(__dirname, "LICENSE.md"),
            to: path.join(__dirname, ".tmp", "dist"),
          },
        ],
      }),
      new VueLoaderPlugin(),
      {
        apply(compiler) {
          compiler.hooks.afterEmit.tapAsync(
            "AfterEmittedPlugin",
            (_params, callback) => {
              killSpawnProc(appBuildProc, () => {
                startBuildSpawnProc(() => {
                  callback();

                  if (!inDevMode) {
                    return;
                  }

                  startAppSpawnProc(() => {
                    process.stdout.write("Application is closed\n");
                  });
                });
              });
            }
          );
        },
      },
      new FaviconsWebpackPlugin({
        logo: path.join(__dirname, "ui", "sshwifty.svg"),
        prefix: "",
        cache: false,
        inject: true,
        favicons: {
          appName: "Sshwifty SSH Client",
          appDescription: "Web SSH Client",
          developerName: "Rui Ni",
          developerURL: "https://vaguly.com",
          background: "#333",
          theme_color: "#333",
          appleStatusBarStyle: "black",
          display: "standalone",
          icons: {
            android: { offset: 0, overlayGlow: false, overlayShadow: true },
            appleIcon: { offset: 5, overlayGlow: false },
            appleStartup: { offset: 5, overlayGlow: false },
            coast: false,
            favicons: { overlayGlow: false },
            firefox: { offset: 5, overlayGlow: false },
            windows: { offset: 5, overlayGlow: false },
            yandex: false,
          },
        },
      }),
      new HtmlWebpackPlugin({
        inject: true,
        template: path.join(__dirname, "ui", "index.html"),
        meta: [
          {
            name: "description",
            content: "Connect to a SSH Server from your web browser",
          },
        ],
        mobile: true,
        lang: "en-US",
        inlineManifestWebpackName: "webpackManifest",
        title: "Sshwifty Web SSH Client",
        minify: {
          html5: true,
          collapseWhitespace: !inDevMode,
          caseSensitive: true,
          removeComments: true,
          removeEmptyElements: false,
        },
      }),
      new HtmlWebpackPlugin({
        filename: "error.html",
        inject: true,
        template: path.join(__dirname, "ui", "error.html"),
        meta: [
          {
            name: "description",
            content: "Connect to a SSH Server from your web browser",
          },
        ],
        mobile: true,
        lang: "en-US",
        minify: {
          html5: true,
          collapseWhitespace: !inDevMode,
          caseSensitive: true,
          removeComments: true,
          removeEmptyElements: false,
        },
      }),
      new MiniCssExtractPlugin({
        filename: inDevMode ? "[id].css" : "[contenthash].css",
        chunkFilename: inDevMode ? "[id].css" : "[contenthash].css",
      }),
    ];

    if (!inDevMode) {
      plugins.push(
        new ImageMinimizerPlugin({
          severityError: "warning",
          deleteOriginalAssets: true,
          maxConcurrency: os.cpus().length,
          minimizerOptions: {
            plugins: [
              ["gifsicle", { interlaced: true }],
              ["mozjpeg", { progressive: true }],
              ["pngquant", { quality: [0.0, 0.03] }],
              [
                "svgo",
                {
                  multipass: true,
                  datauri: "enc",
                  indent: 0,
                  plugins: [
                    {
                      sortAttrs: true,
                      inlineStyle: true,
                    },
                  ],
                },
              ],
            ],
          },
        })
      );
      plugins.push(new CleanWebpackPlugin());
    }

    return plugins;
  })(),
};
