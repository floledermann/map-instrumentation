
/*
// run a local webserver to serve up testcases and instrumentation files
const http = require('http');
const ecstatic = require('ecstatic');
 
const server = http.createServer(
  ecstatic({ root: __dirname + '/testcases' })
);

// set low timeout for keep-alive requests in order to able to close the server
server.setTimeout(500);
server.listen(8080);
 
console.log('Listening on :8080');
*/

// connect to Chrome debugger

const chrome_remote = require('chrome-remote-interface');

const URL = 'http://localhost:8080/simple.html';
//const URL = 'https://bost.ocks.org/mike/map/step-7.html';
//const URL = 'http://www.nytimes.com/interactive/2014/07/03/world/middleeast/syria-iraq-isis-rogue-state-along-two-rivers.html';

// go to http://localhost:9222/ to check remote debugging

// Debugging protocol documentation
// https://chromedevtools.github.io/debugger-protocol-viewer/tot/
// https://github.com/cyrus-and/chrome-remote-interface#api

chrome_remote((client) => {
    // extract domains
    const {Network, Page, Debugger} = client;
    // setup handlers
    Network.requestWillBeSent((params) => {
        console.log("Loading resource: " + params.request.url);
    });
    Page.loadEventFired(() => {
        console.log("Page finished loading");
        //closeAll();
    });
    // enable events then start!
    Promise.all([
        Network.enable(),
        Page.enable(),
        Debugger.enable()
    ]).then(() => {
        Debugger.pause();
        Debugger.paused( (options) => {
            console.log("Debugger paused");
            console.dir(options);
        });
        return Page.navigate({url: URL});
    }).catch((err) => {
        console.error('ERROR: ' + err.message);
        closeAll();
    });
    
    function closeAll() {
        client.close();
        console.log("Closing Server...");
        server.close(() => console.log('Server closed'));
        //server.unref();
        //process.exit( 0 );
    }
}).on('error', (err) => {
    console.error('Cannot connect to remote endpoint:', err);
    server.close(() => console.log('Server closed'));
});