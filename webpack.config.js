// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2020 Rui NI <nirui@gmx.com>
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
  HtmlWebpackPlugin = require("html-webpack-plugin"),
  MiniCssExtractPlugin = require("mini-css-extract-plugin"),
  OptimizeCssAssetsPlugin = require("optimize-css-assets-webpack-plugin"),
  VueLoaderPlugin = require("vue-loader/lib/plugin"),
  FaviconsWebpackPlugin = require("favicons-webpack-plugin"),
  ManifestPlugin = require("webpack-manifest-plugin"),
  ImageminPlugin = require("imagemin-webpack-plugin").default,
  CopyPlugin = require("copy-webpack-plugin"),
  TerserPlugin = require("terser-webpack-plugin"),
  { CleanWebpackPlugin } = require("clean-webpack-plugin");

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

const startAppSpawnProc = onExit => {
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
        detached: true
      }),
      waiter = new Promise(resolve => {
        let closed = false;

        proc.stdout.on("data", msg => {
          process.stdout.write(msg.toString());
        });

        proc.stderr.on("data", msg => {
          process.stderr.write(msg.toString());
        });

        proc.on("exit", n => {
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
      waiter
    };
  });
};

const startBuildSpawnProc = onExit => {
  killSpawnProc(appBuildProc, () => {
    let mEnv = {};

    for (let i in process.env) {
      mEnv[i] = process.env[i];
    }

    mEnv["NODE_ENV"] = process.env.NODE_ENV;

    process.stdout.write("Generating source code ...\n");

    let proc = spawn("go", ["generate", "./..."], {
        env: mEnv,
        detached: true
      }),
      waiter = new Promise(resolve => {
        let closed = false;

        proc.stdout.on("data", msg => {
          process.stdout.write(msg.toString());
        });

        proc.stderr.on("data", msg => {
          process.stderr.write(msg.toString());
        });

        proc.on("exit", n => {
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
      waiter
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
    app: path.join(__dirname, "ui", "app.js")
  },
  devtool:
    process.env.NODE_ENV === "development" ? "inline-source-map" : "source-map",
  output: {
    publicPath: "/sshwifty/assets/",
    path: path.join(__dirname, ".tmp", "dist"),
    filename: process.env.NODE_ENV === "development" ? "[id].js" : "[hash].js"
  },
  resolve: {
    alias: {
      vue$: "vue/dist/vue.esm.js"
    }
  },
  optimization: {
    splitChunks:
      process.env.NODE_ENV === "development"
        ? {}
        : {
            chunks: "all",
            minSize: 128000,
            maxSize: 244000,
            automaticNameDelimiter: ".",
            automaticNameMaxLength: 16,
            name: true
          },
    minimize: process.env.NODE_ENV !== "development",
    minimizer:
      process.env.NODE_ENV === "development"
        ? []
        : [
            new TerserPlugin({
              test: /\.js$/,
              terserOptions: {
                ecma: undefined,
                warnings: false,
                parse: {},
                compress: {},
                mangle: true,
                module: false,
                output: {
                  beautify: false,
                  comments: false
                },
                toplevel: false,
                nameCache: null,
                ie8: false,
                keep_classnames: false,
                keep_fnames: false,
                safari10: false
              }
            })
          ]
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ["vue-style-loader", MiniCssExtractPlugin.loader, "css-loader"]
      },
      {
        test: /\.html/,
        use: "html-loader"
      },
      {
        test: /\.vue$/,
        loader: "vue-loader"
      },
      {
        test: /\.(woff(2)?|ttf|eot)(\?v=\d+\.\d+\.\d+)?$/,
        use: "file-loader"
      },
      {
        test: /\.(gif|png|jpe?g|svg)$/i,
        use: [
          {
            loader: "file-loader",
            options: {
              name: '[contenthash].[ext]',
              esModule: false
            }
          }
        ]
      },
      {
        test: /\.js$/,
        exclude: /(node_modules)/,
        use: "babel-loader"
      }
    ]
  },
  plugins: (function() {
    var plugins = [
      new webpack.SourceMapDevToolPlugin(),
      new webpack.DefinePlugin(
        process.env.NODE_ENV === "production"
          ? {
              "process.env": {
                NODE_ENV: JSON.stringify(process.env.NODE_ENV)
              }
            }
          : {}
      ),
      new webpack.LoaderOptionsPlugin({
        options: {
          handlebarsLoader: {}
        }
      }),
      new CopyPlugin([
        {
          from: path.join(__dirname, "ui", "robots.txt"),
          to: path.join(__dirname, ".tmp", "dist")
        },
        {
          from: path.join(__dirname, "README.md"),
          to: path.join(__dirname, ".tmp", "dist")
        },
        {
          from: path.join(__dirname, "DEPENDENCIES.md"),
          to: path.join(__dirname, ".tmp", "dist")
        },
        {
          from: path.join(__dirname, "LICENSE.md"),
          to: path.join(__dirname, ".tmp", "dist")
        }
      ]),
      new VueLoaderPlugin(),
      {
        apply(compiler) {
          compiler.hooks.afterEmit.tapAsync(
            "AfterEmitPlugin",
            (_param, callback) => {
              killSpawnProc(appBuildProc, () => {
                startBuildSpawnProc(() => {
                  callback();

                  if (process.env.NODE_ENV !== "development") {
                    return;
                  }

                  startAppSpawnProc(() => {
                    process.stdout.write("Application is closed\n");
                  });
                });
              });
            }
          );
        }
      },
      new FaviconsWebpackPlugin({
        logo: path.join(__dirname, "ui", "sshwifty.svg"),
        prefix: "",
        cache: false,
        inject: true,
        favicons: {
          appName: "Sshwifty SSH Client",
          appDescription: "Web SSH Client",
          developerName: "Rui NI",
          developerURL: "https://vaguly.com",
          background: "#333",
          theme_color: "#333",
          appleStatusBarStyle: "black",
          icons: {
            android: { offset: 0, overlayGlow: false, overlayShadow: true },
            appleIcon: { offset: 5, overlayGlow: false },
            appleStartup: { offset: 5, overlayGlow: false },
            coast: false,
            favicons: { overlayGlow: false },
            firefox: { offset: 5, overlayGlow: false },
            windows: { offset: 5, overlayGlow: false },
            yandex: false
          }
        }
      }),
      new HtmlWebpackPlugin({
        inject: true,
        template: path.join(__dirname, "ui", "index.html"),
        meta: [
          {
            name: "description",
            content: "Connect to a SSH Server from your web browser"
          }
        ],
        mobile: true,
        lang: "en-US",
        inlineManifestWebpackName: "webpackManifest",
        title: "Sshwifty Web SSH Client",
        minify: {
          html5: true,
          collapseWhitespace:
            process.env.NODE_ENV === "development" ? false : true,
          caseSensitive: true,
          removeComments: true,
          removeEmptyElements: false
        }
      }),
      new HtmlWebpackPlugin({
        filename: "error.html",
        inject: true,
        template: path.join(__dirname, "ui", "error.html"),
        meta: [
          {
            name: "description",
            content: "Connect to a SSH Server from your web browser"
          }
        ],
        mobile: true,
        lang: "en-US",
        minify: {
          html5: true,
          collapseWhitespace:
            process.env.NODE_ENV === "development" ? false : true,
          caseSensitive: true,
          removeComments: true,
          removeEmptyElements: false
        }
      }),
      new ImageminPlugin({
        disable: process.env.NODE_ENV === "development",
        pngquant: {
          quality: "3-10"
        }
      }),
      new MiniCssExtractPlugin({
        filename:
          process.env.NODE_ENV === "development" ? "[id].css" : "[hash].css",
        chunkFilename:
          process.env.NODE_ENV === "development"
            ? "[id].css"
            : "[chunkhash].css"
      }),
      new OptimizeCssAssetsPlugin({
        assetNameRegExp: /\.css$/,
        cssProcessor: require("cssnano"),
        cssProcessorPluginOptions: {
          preset: ["default", { discardComments: { removeAll: true } }]
        },
        canPrint: true
      }),
      new webpack.BannerPlugin({
        banner:
          "This file is a part of Sshwifty Project. Automatically " +
          "generated at " +
          new Date().toTimeString() +
          ", DO NOT MODIFIY"
      }),
      new ManifestPlugin()
    ];

    if (process.env.NODE_ENV !== "development") {
      plugins.push(new CleanWebpackPlugin());
    }

    return plugins;
  })()
};
