const crypto = require('crypto');
const os = require('os');
const path = require('path');

process.env.BABEL_ENV = 'development';
process.env.NODE_ENV = 'development';

const projectRoot = path.resolve(__dirname, '..');
process.chdir(projectRoot);

const projectKey = crypto
  .createHash('sha256')
  .update(`${projectRoot}:${process.versions.node}`)
  .digest('hex')
  .slice(0, 16);
const paths = require('react-scripts/config/paths');
paths.appWebpackCache = path.join(os.tmpdir(), 'libero-webpack-cache', projectKey);

require('react-scripts/scripts/start');