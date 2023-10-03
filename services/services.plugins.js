const http = require("http")
const https = require("https")
const net = require('net');
const querystring = require('querystring');

const httpProxy = require('http-proxy');

const pluginManager = async (combinedPlugins) => {
    const promises = [];

    for (const plug of combinedPlugins) {
        for (const plugin of plug) {
            promises.push(makeAPIRequest(plugin.method, plugin.endpoint, true).catch(e => {
                if (plugin.breakable) {
                    throw e; // Preserve the original stack trace
                }
            }));
        }
    }

    try {
        await Promise.all(promises);
    } catch (e) {
        // You can handle the error here, or re-throw it to propagate further
        throw e;
    }
}

const makeAPIRequest = (method, apiURL, secure, postData = null) => {
    return new Promise((resolve, reject) => {

        let formatURL = `http${secure ? "s" : ""}://${apiURL}`
        const secureHTTP = secure ? https : http

        const options = {
            method: method.toUpperCase(),
            headers: {
                'Content-Type': 'application/json',
            },
        };

        // If the request method is POST or PUT and data is provided, add the data to the request
        if ((method.toUpperCase() == 'POST' || method.toUpperCase() == 'PUT') && postData) {

            switch (postData[0]) {
                case "Query":
                    formatURL = formatURL + "?" + querystring.stringify(postData[1]);
                    break;
            }

            options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(postData));
        }

        console.log(formatURL)

        const req = secureHTTP.request(formatURL, options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            res.on('end', () => {
                // Parse the response data as JSON and resolve the promise
                const contentType = res.headers['content-type'];
                if (contentType && contentType.includes('application/json')) {
                    const jsonResponse = JSON.parse(responseData);
                    resolve(jsonResponse);
                } else {
                    resolve(responseData)
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        // If the request method is POST or PUT and data is provided, send the data in the request body
        if ((method === 'POST' || method === 'PUT') && postData) {
            req.write(JSON.stringify(postData));
        }

        req.end();
    });
};


const exportRequest = async (method, endpoint, secure, postData) => {
    let requestRes = await makeAPIRequest(method, endpoint, secure, postData)
    return requestRes
}

const paramFactory = (req) => {
    const data = req.query || req.params || req.headers || req.body;
    const dataType = checkData(req);
    // Do something with the data based on the request type
    if (Object.keys(data).length !== 0) {
        console.log(dataType, data);
        return [dataType, data]
    } else {
        console.log('Unknown POST request type');
        return [dataType, 'Unknown POST request type']
    }
}

const checkData = (req) => {
    if (Object.keys(req.query).length !== 0) {
        return 'Query';
    } else if (Object.keys(req.params).length !== 0) {
        return 'Path';
    } else if (Object.keys(req.headers).length !== 0) {
        return 'Header';
    } else if (Object.keys(req.body).length !== 0) {
        return 'Body';
    } else {
        return 'Unknown POST request type';
    }
};


module.exports = {
    pluginManager,
    makeAPIRequest,
    exportRequest,
    paramFactory
}