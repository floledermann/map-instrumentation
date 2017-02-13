
const esprima = require('esprima');
const estraverse = require('estraverse');
const escodegen = require('escodegen');

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
    
    var startTime = Date.now();
    var lastTime = Date.now();
    var instructions = 0;
    
    var scriptData = {};
    function getScriptSource(scriptId, callback) {
        var data = scriptData[scriptId];
        if (!data) console.error("No script with id: " + scriptId);
        if (data.srcLines) {
            callback(data);
        }
        else {
            Debugger.getScriptSource({scriptId: scriptId}).then(function(result) {
                //console.log('---------------------------------');
                //console.log(result.scriptSource);
                //console.log('---------------------------------');
                data.srcLines = result.scriptSource.split("\n");
                console.log("Parsing script " + scriptId);
                data.ast = esprima.parse(result.scriptSource, {
                    sourceType: "script",
                    range: true,    // Annotate each node with its index-based location
                    loc: true,      // Annotate each node with its column and row-based location
                    tolerant:true,  // Tolerate a few cases of syntax errors
                    comments: true  // Collect every line and block comment
                });
                // store partents for easier bi-directional traversal
                estraverse.traverse(data.ast, {
                    enter: function (node, parent) {
                        node.parent = parent;
                    }
                });
                //console.log(data.srcLines.length + " lines");
                callback && callback(data);
            });                
        }     
    }
    function getNodeAtLocation(ast, loc) {
        // TODO: somehow cache resutls or store last node position to speed this up
        var validNode = null;
        //console.dir(loc);
        estraverse.traverse(ast, {
            enter: function(node) {
                //console.log("Checking node: " + node.type);
                //console.dir(node.loc);
                if ((loc.line < node.loc.start.line) ||
                    (loc.line > node.loc.end.line) ||
                    (loc.line == node.loc.start.line && loc.column < node.loc.start.column) ||
                    (loc.line == node.loc.end.line && loc.column > node.loc.end.column)) {
                    //console.log("... skipping");
                    return estraverse.VisitorOption.Skip;
                }
                //console.log("Checking node: " + node.type);
                validNode = node;
            }
        });
        return validNode;
    }
    
    function getAssignmentParent(node) {
        const nodeTypes = [
            //"VariableDeclarator", // handled separately, only if init present
            "AssignmentExpression",
            "UpdateExpression"
        ];
        const breakTypes = [
            "FunctionExpression"
        ];
        while (node) {
            if (node.type == "VariableDeclarator" && node.init) return node; 
            if (nodeTypes.includes(node.type)){
                return node;
            }
            if (breakTypes.includes(node.type)) {
                return null;
            }
            node = node.parent;
        }
        return null;
    }
    
    // https://chromedevtools.github.io/debugger-protocol-viewer/tot/Debugger/#event-scriptParsed
    function step(options) {
        //console.dir(options.callFrames[0].location);
        getScriptSource(options.callFrames[0].location.scriptId, function(result) {
            
            
            var curTime = Date.now();
            var loc = options.callFrames[0].location;

            instructions++;

            var lineStr = result.srcLines[loc.lineNumber - result.startLine];
            //console.log(loc.lineNumber + ":" + loc.columnNumber + "  " + lineStr);

            var node = getNodeAtLocation(result.ast, {line: loc.lineNumber - result.startLine + 1, column: loc.columnNumber});
            node = getAssignmentParent(node);
            if (node) {
                console.log(escodegen.generate(node));
            }
            
            if (curTime - lastTime > 5000) {
                console.log("#### "  + Math.round((curTime - startTime) / 1000) + "s, " + instructions + " instructions analyzed");
                /*
                var start = lineStr.lastIndexOf(";",loc.columnNumber);
                if (start == -1) start = 0;
                var end = lineStr.indexOf(";",loc.columnNumber);
                if (end == -1) end = undefined;
                var statement = lineStr.substring(start, end);
                //console.log(" => " + (node ? node.type : "NULL") + "\n");
                */
                lastTime = curTime;
            }
            //console.log("  " + result.srcLines[options.callFrames[0].location.lineNumber - result.startLine]);
            //console.dir(options);
            //console.dir(options.callFrames[0].scopeChain);
            Debugger.stepInto();
        });
    }
    
    // enable events then start!
    Promise.all([
        Network.enable(),
        Page.enable(),
        Debugger.enable()
    ]).then(() => {
        Debugger.scriptParsed(function(result) {
            console.log("Script parsed: " + result.scriptId);
            // console.dir(result);
            scriptData[result.scriptId] = result;
            //getScriptSource(result.scriptId);
        })
        Debugger.pause();
        Debugger.paused( step );
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