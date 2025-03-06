// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2025 Ni Rui <ranqus@gmail.com>
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

import webpack from "webpack";
import { spawn } from "child_process";
import path from "path";
import os from "os";
import HtmlWebpackPlugin from "html-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import CssMinimizerPlugin from "css-minimizer-webpack-plugin";
import ImageMinimizerPlugin from "image-minimizer-webpack-plugin";
import { VueLoaderPlugin  } from "vue-loader";
import WebpackFavicons from "webpack-favicons";
import CopyPlugin from "copy-webpack-plugin";
import TerserPlugin from "terser-webpack-plugin";
import { CleanWebpackPlugin } from "clean-webpack-plugin";
import ESLintPlugin from "eslint-webpack-plugin";

const __dirname = path.resolve(path.dirname(''));
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

export default {
  entry: {
    app: path.join(__dirname, "ui", "app.js"),
  },
  devtool: inDevMode ? "inline-source-map" : "source-map",
  output: {
    publicPath: "/sshwifty/assets/",
    path: path.join(__dirname, ".tmp", "dist"),
    filename: "[name]-[contenthash:8].js",
    chunkFormat: "array-push",
    chunkFilename: "chunk[contenthash:8].js",
    assetModuleFilename: "asset[contenthash:8][ext]",
    clean: true,
    charset: true,
  },
  resolve: {
    alias: {
      vue$: "vue/dist/vue.esm.js",
    },
  },
  optimization: {
    nodeEnv: process.env.NODE_ENV,
    concatenateModules: true,
    runtimeChunk: "single",
    mergeDuplicateChunks: true,
    flagIncludedChunks: true,
    providedExports: true,
    usedExports: true,
    realContentHash: false,
    innerGraph: true,
    splitChunks: inDevMode
      ? false
      : {
          chunks: "all",
          minSize: 20000,
          maxSize: 90000,
          minRemainingSize: 0,
          minChunks: 1,
          enforceSizeThreshold: 50000,
          name(module, chunks, cacheGroupKey) {
            const moduleFileName = module
              .identifier()
              .split("/")
              .reduceRight((item) => item);
            const allChunksNames = chunks.map((item) => item.name).join("~");
            return `${cacheGroupKey}~${allChunksNames}~${moduleFileName}`;
          },
          cacheGroups: {
            vendors: {
              test: /[\\/]node_modules[\\/]/,
              priority: -10,
              reuseExistingChunk: true,
            },
            default: {
              priority: -20,
              reuseExistingChunk: true,
            },
          },
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
        test: /\.(ico|jpe?g|png|gif|svg|woff2?)$/i,
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
      new webpack.optimize.LimitChunkCountPlugin({
        maxChunks: 7,
      }),
      new webpack.optimize.MinChunkSizePlugin({
        minChunkSize: 56000,
      }),
      new webpack.DefinePlugin(
        !inDevMode
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
      new webpack.BannerPlugin({
        banner:
          "This file is a part of Sshwifty. Automatically " +
          "generated at " +
          new Date().toTimeString() +
          ", DO NOT MODIFIY",
      }),
      new ESLintPlugin({}),
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
      new WebpackFavicons({
        src: path.join(__dirname, "ui", "sshwifty.svg"),
        appName: "Sshwifty SSH Client",
        appShortName: "Sshwifty",
        appDescription: "Web SSH Client",
        developerName: "Ni Rui",
        developerURL: "https://nirui.org",
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
          windows: { offset: 5, overlayGlow: false },
          yandex: false,
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
        filename: inDevMode ? "[name].css" : "[name]-[contenthash:8].css",
        chunkFilename: inDevMode
          ? "[name].css"
          : "[name]-chunk[contenthash:8].css",
      }),
    ];

    if (!inDevMode) {
      const defaultImageCompressOptions = {
        quality: 75,
      };
      plugins.push(
        new ImageMinimizerPlugin({
          concurrency: os.cpus().length,
          minimizer: {
            implementation: ImageMinimizerPlugin.sharpMinify,
            options: {
              encodeOptions: {
                jpeg: {
                  ...defaultImageCompressOptions,
                  lossless: false,
                },
                webp: {
                  ...defaultImageCompressOptions,
                  lossless: false,
                },
                avif: {
                  ...defaultImageCompressOptions,
                  lossless: false,
                },
                png: {
                  ...defaultImageCompressOptions,
                  compressionLevel: 9,
                },
                gif: {},
              },
            },
          },
        })
      );
      plugins.push(
        new ImageMinimizerPlugin({
          concurrency: os.cpus().length,
          minimizer: {
            implementation: ImageMinimizerPlugin.svgoMinify,
            options: {
              encodeOptions: {
                multipass: true,
                plugins: [
                  "preset-default",
                ],
              },
            },
          },
        })
      );
      plugins.push(new CleanWebpackPlugin());
    }

    return plugins;
  })(),
};
