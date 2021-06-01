const path = require('path')
const HTMLPlugin = require('html-webpack-plugin')

module.exports = {
    entry: './demo.tsx',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'index.js'
    },
    devServer: {
        contentBase: path.join(__dirname, 'dist'),
        compress: true,
        port: 9988,
        hot: true
    },
    module: {
        rules: [
            {
                test: /\.(js|jsx|ts|tsx)$/,
                use: [
                    {
                        loader: 'babel-loader',
                    }
                ],
                exclude: /(node_modules|bower_components)/
            }
        ]   
    },
    plugins: [
        new HTMLPlugin({
            template: './index.html',
            filename: 'index.html'
        })
    ]
}