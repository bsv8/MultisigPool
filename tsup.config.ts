import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'], // 同时输出CommonJS和ESM格式
  dts: true, // 生成类型声明文件
  clean: true, // 构建前清理输出目录
  splitting: false, // 不进行代码分割
  sourcemap: true, // 生成sourcemap
  
  // 排除大型依赖，让用户自己安装
  external: [
    // 在这里添加需要排除的依赖
  ],
  
  // 输出配置
  outDir: 'dist',
  
  // 压缩配置
  minify: false, // 库项目通常不需要压缩，便于调试
  
  // 目标环境
  target: 'es2020',
  
  // 处理Node.js内置模块
  platform: 'node',
  
  // 代码分割配置
  treeshake: true,
  
  // 横幅配置
  banner: {
    js: '// MultisigPool - A multisig pool implementation',
  },
}) 