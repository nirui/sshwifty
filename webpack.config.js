// Sshwifty - A Web SSH client
//
// Copyright (C) 2019 Rui NI <nirui@gmx.com>
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
  { exec, spawn } = require("child_process"),
  path = require("path"),
  HtmlWebpackPlugin = require("html-webpack-plugin"),
  MiniCssExtractPlugin = require("mini-css-extract-plugin"),
  OptimizeCssAssetsPlugin = require("optimize-css-assets-webpack-plugin"),
  VueLoaderPlugin = require("vue-loader/lib/plugin"),
  WebappWebpackPlugin = require("webapp-webpack-plugin"),
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
          if (closed) {
            return;
          }

          closed = true;

          onExit();
          resolve(n);
          appSpawnProc = null;
        });
      });

    appSpawnProc = {
      proc,
      waiter
    };
  });
};

const killAllProc = () => {
  if (appBuildProc !== null) {
    appBuildProc.stdin.end();
    appBuildProc.stdout.destroy();
    appBuildProc.stderr.destroy();
    appBuildProc.kill();

    appBuildProc = null;
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
    publicPath: "/",
    path: path.join(__dirname, ".tmp", "dist"),
    filename: "_[hash].js"
  },
  resolve: {
    alias: {
      vue$: "vue/dist/vue.esm.js"
    }
  },
  optimization: {
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
        use: "file-loader"
      },
      {
        test: /\.js$/,
        exclude: /(node_modules)/,
        use: "babel-loader"
      }
    ]
  },
  plugins: [
    new webpack.ProgressPlugin(),
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
    new CleanWebpackPlugin(),
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
      apply: compiler => {
        compiler.hooks.afterEmit.tap("AfterEmitPlugin", () => {
          if (appBuildProc !== null) {
            let aBuildProc = appBuildProc;
            appBuildProc = null;

            process.stdout.write(
              "Killing the previous source code generater ...\n"
            );

            aBuildProc.stdin.end();
            aBuildProc.stdout.destroy();
            aBuildProc.stderr.destroy();
            aBuildProc.kill();
          }

          killSpawnProc(appSpawnProc, () => {
            process.stdout.write("Generating source code ...\n");

            appBuildProc = exec(
              "NODE_ENV=" + process.env.NODE_ENV + " go generate ./...",
              (err, stdout, stderr) => {
                process.stdout.write("Source code is generated ...\n");

                appBuildProc = null;

                if (stdout) process.stdout.write(stdout);
                if (stderr) process.stderr.write(stderr);

                if (process.env.NODE_ENV !== "development") {
                  return;
                }

                startAppSpawnProc(() => {
                  appSpawnProc = null;
                });
              }
            );
          });
        });
      }
    },
    new WebappWebpackPlugin({
      logo: path.join(__dirname, "ui", "sshwifty.png"),
      prefix: "",
      cache: false,
      favicons: {
        appName: "Sswifty",
        appDescription: "Web SSH Client",
        developerName: "Rui NI",
        developerURL: "https://vaguly.com",
        background: "#333",
        theme_color: "#333",
        appleStatusBarStyle: "black",
        icons: {
          android: { offset: 10, overlayGlow: false, overlayShadow: true },
          appleIcon: { offset: 10, overlayGlow: false },
          appleStartup: { offset: 10, overlayGlow: false },
          coast: false,
          favicons: { overlayGlow: false },
          firefox: { offset: 20, overlayGlow: false },
          windows: { offset: 10, overlayGlow: false },
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
      disable: process.env.NODE_ENV !== "production",
      pngquant: {
        quality: "15-30"
      }
    }),
    new MiniCssExtractPlugin({
      filename: "_[hash].css",
      chunkFilename: "_[chunkhash].css"
    }),
    new OptimizeCssAssetsPlugin({
      assetNameRegExp: /^_.*\.css$/g,
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
  ]
};
