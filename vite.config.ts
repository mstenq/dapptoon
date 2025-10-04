import { defineConfig } from "vite";
import react from '@vitejs/plugin-react'
import peerbit from "@peerbit/vite";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react({
            include: /\.(tsx?|jsx?)$/,
            exclude: [/node_modules/, /\.worker\.(js|ts)$/, /public\/.*\.js$/],
            babel: {
                plugins: [
                    ['babel-plugin-react-compiler'],
                    ['@babel/plugin-proposal-decorators', { legacy: true }],
                    ['@babel/plugin-proposal-class-properties']
                ],
            },
        }), 
        peerbit()
    ],
    
    optimizeDeps: {
        esbuildOptions: {
            target: "esnext",
        },
        include: [
            "protobufjs/minimal",
            "@protobufjs/float", 
            "@protobufjs/inquire", 
            "@protobufjs/pool",
        ],
    },
    
    worker: {
        format: 'es'
    },
    
    build: {
        target: "esnext",
        commonjsOptions: {
            transformMixedEsModules: true,
        },
        rollupOptions: {
            output: {
                // Ensure clean output directory structure
                assetFileNames: (assetInfo) => {
                    // Prevent any node_modules from being copied
                    if (assetInfo.name && assetInfo.name.includes('node_modules')) {
                        return 'assets/[name].[hash][extname]';
                    }
                    return 'assets/[name].[hash][extname]';
                }
            }
        },
        // Ensure only embeddable files are included
        copyPublicDir: true,
        // Explicitly exclude problematic directories
        outDir: 'dist',
    },
    
    define: {
        APP_VERSION: JSON.stringify(process.env.npm_package_version),
        global: 'globalThis',
    },

    /*  server: fs.existsSync("./.cert/key.pem")
         ? {
               port: 5802,
               https: {
                   key: fs.readFileSync("./.cert/key.pem"),
                   cert: fs.readFileSync("./.cert/cert.pem"),
               },
               host: "chat.test.xyz",
           }
         : undefined, */
});
