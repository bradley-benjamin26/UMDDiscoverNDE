const config = require('./webpack.config');

module.exports = {
	...config,
	output: {
		...config.output,
		publicPath: 'auto',
	},
};
