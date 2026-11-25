'use strict';
module.exports = [
  {ignores:['node_modules/**','dist/**','output/**','test-results/**','.agents/**','public/vendor/**']},
  {files:['**/*.js'],languageOptions:{ecmaVersion:'latest',sourceType:'commonjs'},rules:{
    'no-debugger':'error',
    'no-unreachable':'error',
    'no-constant-binary-expression':'error'
  }}
];
