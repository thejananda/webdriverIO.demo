const fs          = require('fs');
const http        = require('http');
const util        = require('util');
const JSFtp       = require('jsftp');
const telnet      = require('telnet-client');
const common      = require('./common.js');

let TELNET_LOG  = null;
var SECURE_OSS = true;
var INTERVAL = 500;
var POLLING = 10000;
var POLLING_GRID = 15000;
var LOGIN_RETRY = false;
var TELNET_PASSWORD = global.__ORBW_PASSWORDS['root']['ssh'];
var USERAGENT = "userAgent";

// When there's a communication error, the app is redirected to the Launchpad.
// Recovery for this is incredibly difficult, so it's better to finish the suite 
// rather than have several misleading failures
var NSP_COMMUNICATION_ERROR = false;
var NSP_COMMUNICATION_ERROR_MSG = "Communication with the server has been disrupted";

var _urlProtocol = 'https';
var _usernameXpath = '//*/input[@id="user" or @name="username"]';
var _passwordXpath = '//*/input[@id="password" or @name="password" or @type="password"]'; 
var _rememberXpath = '//*/input[@type="checkbox"]';
var _loginButtonXpath = '//*[@id="loginbtn" or @eventproxy="isc_ButtonItem_0_button"]';
var _defaultUser = 'admin';
var _defaultPassword = global.__ORBW_PASSWORDS['legacy'];
var _samDir = 'nsp/nfmp' // will change with https
var _tooltip_XP = '//*[@eventproxy="alu_nms_Hover"]/table/tbody/tr/td';


module.exports = {
    

    initRetry: async function(x){
        if (typeof global.driver === "undefined")
            return;      
        if (typeof x !== "number")
            x = 0;        
        if (x >= 3)
            throw new Error('Unable to instantiate the browser.  Check stderr.log.');
        
        async function determineInit(){
            if (global.__USE_W3C){
                console.log("Initializing the browser in W3C mode");
                return global.driver.initW3C();
            }
            else {
                return global.driver._init();
            }
            
        }

        return determineInit().then(
            function resolve(ret){
                global.driverInitialized = true;
            }, 
            function reject(err){
                x = x + 1;
                console.error(err);
                console.log('<br />Exception initializing the browser.  Retry #' + x + ' ...');
                return global.driver.pause(10000).init(x);
            });
    },

    initW3C: async function() {
        /* This code is essentially copy + pasted from webdriverio/build/lib/protocol/init.js
         * 
         * WebdriverioIO v4 has zero support for W3C.  In order to have access to W3C, we have to 
         * instantiate the browser differently, and that's what this function does.
         * 
         */
        function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
        var _ErrorHandler;
        var _package;
        try { 
            // local
            _ErrorHandler = require('../../../../node_modules/webdriverio/build/lib/utils/ErrorHandler');  
            _package = require('../../../../node_modules/webdriverio/package.json');
        } catch(e){
            // regression
            _ErrorHandler = require('../../../../../../node_modules/webdriverio/build/lib/utils/ErrorHandler');
            _package = require('../../../../../../node_modules/webdriverio/package.json');
        }
        
        var _package2 = _interopRequireDefault(_package);
        var _deepmerge = require('deepmerge');
        var _deepmerge2 = _interopRequireDefault(_deepmerge);

        var desiredCapabilities = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

        var lastCommand = driver.commandList.slice(-4, -3);
        var isInternalCall = lastCommand.length && lastCommand[0].name === 'reload';

        /**
         * make sure we don't run this command within wdio test run
         */
        if (driver.options.isWDIO && !isInternalCall) {
            throw new _ErrorHandler.CommandError('Don\'t call the \'init\' command when using the wdio test runner. ' + 'Your session will get initialised and closed automatically.');
        }

        /*!
         * check if session was already established
         */
        if (driver.requestHandler.sessionID) {
            throw new _ErrorHandler.ProtocolError('Cannot init a new session, please end your current session first');
        }

        driver.desiredCapabilities = (0, _deepmerge2.default)(driver.desiredCapabilities, desiredCapabilities);
        if (desiredCapabilities.sessionId) {
            driver.sessionId = desiredCapabilities.sessionId;
        }

        /**
         * report library identity to server
         * @see https://groups.google.com/forum/#!topic/selenium-developers/Zj1ikTz632o
         */
        driver.desiredCapabilities = (0, _deepmerge2.default)(driver.desiredCapabilities, {
            requestOrigins: {
                url: _package2.default.homepage,
                version: _package2.default.version,
                name: _package2.default.name
            }
        });

        return driver.requestHandler.create({
            path: '/session',
            method: 'POST'
        }, {
            desiredCapabilities: {}, //this.desiredCapabilities
            capabilities: driver.desiredCapabilities
        })
    },

    sendXML: async function(){
        /* Sends an XML file to a remote server
        :Args:
            - server: the server to send the xml to
            - xml   : the incoming xml, either a block of plain text or the path and local name of the xml file
        :Usage:
            - sendXML(server,'regr_svc_view_group_filter.xml');
        */
        var server = arguments[0].split(':')[0]; // Remove any ports from the IP
        var xml    = arguments[1];

        //await testSecureOSS(server)

        return new Promise((resolve, reject) => {
            var postRequest = {
                host    : server,
                path    : "/xmlapi/invoke",
                port    : SECURE_OSS ? 8443 : 8080,
                method  : "POST",
                headers : { 'Content-Type': 'text/xml; charset=UTF-8' }
            };

            var protocol = SECURE_OSS ? https : http;

            // Add additional params for SSL to prevent Self-Signing
            // Certificate Error
            if (SECURE_OSS) {
                postRequest["rejectUnauthorized"] = false;
                postRequest.agent = new protocol.Agent(postRequest);
            }

            var req = protocol.request(postRequest, function(res) {
                var buffer = "";
                res.on("data", function(data) { buffer += data; });
                res.on("end", function(data) {
                    resolve(buffer);
                });
            });

            if(xml.slice(-4) === ".xml") {
                fs.readFile(xml, 'utf8', function(err, body){
                    req.write(body);
                    req.end();
                });
            } else {
                req.write(xml);
                req.end();
            }
        });
    },

    internalPause: async function(x){
        var interval = 30000;

        // REST people used to calling "driver.pause()"
        if (global.driverInitialized === false){
            return new Promise((resolve, reject) => {
                setTimeout(resolve, x);
            });
        }

        if (x < interval){
            return driver._pause(x);
        } else {
            await driver._pause(interval);
            await driver.element('/html/body');
            await driver.pause(x - interval);
        }
    },

    internalLog: async function()
    {
        if (__BROWSER.toLowerCase().indexOf("firefox") >= 0){
            console.log("driver.log() currently not supported on firefox");
            return;
        }
        return driver._log.apply(driver, arguments).then(ret => {
            return ret;
        }, err => {
            console.log("internalLog error:", err);
            return err;
        });
    },

    internalDoubleClick: async function(selector){
        await driver.click(selector)
        await driver.pause(50)
        await driver.click(selector);
    },

    internalKeys: async function(keys){
        //if (__BROWSER === "chrome" || __BROWSER.indexOf("ie") >= 0){
        //    return driver._keys.apply(driver, arguments);
        //}

        // session / sessionID / keys not supported in geckodriver
        let keymap = {
            "Backspace": "\uE003",
            "Tab": "\uE004",
            "Enter": "\uE007",
            "Shift": "\uE008",
            "Control": "\uE009",
            "Alt": "\uE00A",
            "Escape": "\uE00C",
            "Left arrow": "\uE012",
            "Up arrow": "\uE013",
            "Right arrow": "\uE014",
            "Down arrow": "\uE015"
        }

        if (typeof keys === "string"){
            keys = [keys];
        }

        for (let i = 0; i < keys.length; i++){
            let k = keys[i]
            let ret = await driver.elementActive();          
                
            let key = Object.keys(ret.value)[0];
            if (typeof key === "string" && key.indexOf("element-") === 0){
                ret.value = {ELEMENT: ret.value[key]};
            }            
            if (Object.keys(keymap).indexOf(k) >= 0) { 
                k = keymap[k]
            }
            
            await driver.elementIdValue(ret.value.ELEMENT, k);
        }
    },

    internalExecute: async function()
    {
        return driver._execute.apply(driver, arguments).then(ret => {
            if (!ret || !ret.value){
                return ret;
            }
            // This is a list
            else if (typeof ret.value === "object" && ret.value.length > 0 && typeof ret.value[0] === "object"){
                // It is, let's convert 
                // [{element-1234-abcd: 'defg-hijk'}, {element-2234-abcd: 'defg-hijk'}]
                let testKey = Object.keys(ret.value[0])[0];
                if (typeof testKey === "string" && testKey.indexOf("element-") === 0){
                    let temp = [];
                    // Convert to {ELEMENT: 'defg-hijk'}
                    ret.value.forEach(function(obj){
                        let key = Object.keys(obj)[0];
                        temp.push({ELEMENT: obj[key]})
                    })
                    ret.value = temp;
                }
            }
            // This is an object
            else if (typeof ret.value === "object" && ret.value.length === undefined){
                // This is an element
                let key = Object.keys(ret.value)[0];
                if (typeof key === "string" && key.indexOf("element-") === 0){
                    ret.value = {ELEMENT: ret.value[key]};
                }
            }
            return ret;
        },
        reject => {
            var message = "driver.execute failed for args(" + util.inspect(arguments) + "): " + reject;
            console.log(message);
            
            if (typeof arguments[0] === "function"){
                console.log(arguments[0].toString());
            }

            if (message.indexOf("not reachable") >= 0){
                throw new Error(message);
            }
            
            return new Error(message);
        });
    },
    
    internalElement: async function(loc){
        // Overrides the element() function to convert element-* to ELEMENT (selenium v3 change)
        let ret = await driver._element(loc);
        if (!ret || ret.value === null){
            console.log("[internalElement] No result for: " + loc);
            return null;
        }
        else if (typeof ret.value === "object" && !Array.isArray(ret.value)){
            // This is an object, convert it
            let key = Object.keys(ret.value)[0];
            if (typeof key === "string" && key.indexOf("element-") === 0){
                ret.value = {ELEMENT: ret.value[key]};
            }
        }
        return ret;
    },


    /* Handle Testcase Exceptions */
    handleTcExcept: async() => 
    {
        var errorText = arguments[0];

        if (typeof errorText !== 'string' || errorText === ''){
            errorText = '';
        }
        else {
            errorText = '_' + errorText
                .replace(' ', '')
                .replace('\'', '')
                .replace(',', '');
        }

        var day = (new Date()).toISOString().slice(0,10).replace(/-/g, '');
        var timestamp = (new Date()).getTime();
        var filename = day + timestamp + errorText + ".png";

        // Print the date and time
        console.log('<br /><b>' + (new Date()).toISOString() + '</b><br />');

        // We can't do screenshots/checkWarning on REST calls
        if (isRealBrowser(__BROWSER))
        {
            // Make the ./screenshots directory if it doesn't exist yet
            if (!fs.existsSync(__SAVEPATH)){
                fs.mkdirSync(__SAVEPATH);
            }

            await driver.saveScreenshot(__SAVEPATH + filename);
            var out = '<div align="center"><a  href="' + __LINKPATH + filename + '">Captured failed screenshot</a><br/>'
                + '<img src="' + __LINKPATH + filename + '" width="270" height="200" '
                + 'onmouseover="this.width=800;this.height=600;" '
                + 'onmouseout="this.width=270;this.height=200;">'
                + '</div>';

            console.log(out);

            // Brief pause to wait for a popup - IE popups take a couple seconds to appear ... causing cascading failures
            await driver.pause(__BROWSER.indexOf('ie') > -1 ? 2500 : 500)
            await driver.checkWarning();

            if (NSP_COMMUNICATION_ERROR){
                throw new Error("[handleTcExcept] Unexpected Launchpad Redirection - throw error");
            }

        }

    },

    webguiScreenshot: async function(){
        /* Saves a screenshot to the local savepath directory
            - errorText: text related to the failure (used in filename and printing)
        */
        var errorText = arguments[0];

        var day = (new Date()).toISOString().slice(0,10).replace(/-/g,"");
        var timestamp = (new Date()).getTime();
        var filename = day + timestamp + errorText + ".png";

        await driver.saveScreenshot(__SAVEPATH + filename).catch(e => {
            console.log("Screenshot failed: ", e);
        });

        var out = '<div align="center"><a  href="' + __LINKPATH + filename + '">'+ errorText + '</a><br/><img src="' + __LINKPATH + filename + '" width="270" height="200" onmouseover="this.width=800;this.height=600;" onmouseout="this.width=270;this.height=200;"></div>';
        console.log(out);
    },


    alertPopUpDismiss: async function(text, time){
        /* Shows a popup then dismisses it - used for showing a test started, or whatever really.
         *  DO NOT USE THIS ON INTERNET EXPLORER! Alert won't dismiss!
            text: what you want the alert to say
            time: how long you want it present for, min 500ms
        */

        // "The SafariDriver does not support alert handling."
        // "To prevent tests from handing when an alert is opened, they are always immediately dismissed."
        if (__BROWSER !== 'safari')
        {
            if (typeof time !== "number" || time < 500)
                time = 500;

            await driver.execute(function(t){
                alert(t);
            }, text);

            await driver.pause(time);
            await driver.alertDismiss();
        }
    },

    // This function is to simplify testcase code and catch rejected promises
    internalWaitForVisible: (locator, timeout, reverse) =>
    {
        timeout = typeof timeout === "number" ? timeout : POLLING;
        reverse = typeof reverse === "boolean" ? reverse : false;
        return driver.waitForVisible(locator, timeout, reverse)
            .then(function(isVisible) { // Promise Fulfilled
                return true;
            }, function(isNotVisible) { // Promise Rejected
                debugPrint(isNotVisible); // Show the message
                return false;
            });
    },

    // Waits up to 5 seconds (to exist) before clicking
    internalClick: function(locator)
    {
        return driver.internalWaitForExist(locator, 5000).then(isExisting => {
            if (isExisting){
                return driver.click(locator);
            }        
            else {
                throw new Error('[internalClick] Locator did not exist, could not click: ' + locator);
            }
        });
    },

    // This function is to simplify testcase code and catch rejected promises
    internalWaitForExist: async (locator, timeout, reverse) =>
    {
        timeout = typeof timeout === "number"  ? timeout : POLLING;
        reverse = typeof reverse === "boolean" ? reverse : false;
        return driver.waitForExist(locator, timeout, reverse)
            .then(function(isExisting) { // Promise Fulfilled
                return true;
            }, function(isNotExisting) { // Promise Rejected
                debugPrint(isNotExisting); // Show the message
                return false;
            });
    },

    // Throws an error if the value was not set properly and an error occurred
    internalSetValue: async (locator, value) => {
        await driver.waitForExist(locator, 5000);
        await driver.internalClearField(locator);
        return driver.setValue(locator, value).then(() => {}, error =>{
            return driver.getValue(locator).then(v => {
                // This is a catch for wdio/react throwing an uneditble error after the value was set
                // ",on" in value
                if (value !== '' && v != value){
                    throw new Error('internalSetValue - value not set properly: ' + error)
                }
            });
        });
    },

    internalClickMenuItem: async (locator, innerText) => {
        /* Hacky, temporary workaround to get menu items dismissed
         * (1) retrieve the classname of the menu item we're clicking
         * (2) using that classname, traverse all elements with that classname and 
         *     click the one the matches our innerText
         *
         * :Args:
         *   - locator: the xpath/css locator of the menu item we're supposed to click
         *   - innerText: the innerText of this menu item so we can match it, not case sensitive
         *
         * :Usages:
         *   - await driver.internalClickMenuItem(locator, innerText);
         *   - await driver.internalClickMenuItem('//div[@data-component-id="reportsNavigation-menuitem" and normalize-space(.)="Repository"]', 'repository');
         */

        let className = await driver.getAttribute(locator, 'className');

        await driver.execute(function(className, innerText){
            let elements = document.getElementsByClassName(className);
            for (let i = 0; i < elements.length; i++){
                if (elements[i].innerText.toLowerCase() === innerText.toLowerCase()){
                    elements[i].click();
                    break;
                }
            }
        }, className, innerText);
    },

    internalClearField: async (locator) => {
        let value = await driver.getValue(locator);

        await driver.click(locator);
        await driver.pause(250);
        for (let i = 0; i < value.length; i++){
            await driver.keys("Backspace");
        }
    },

    selectFromDropdown: async (menuLocator, menuItem) => 
    {
        /* 
          Opens the menu then constructs a locator for the 'menuItem', clicking it.
           If the 'menuItem' argument is a locator, then use that directly.
           If the 'menuItem' locator does not exist, close the dropdown then throw an error.
        
         Args:
             - menuLocator: Locator to click for the dropdown menu to open
             - menuItem: String Name or Locator to click for the item in the menu
        
         Examples:
            driver.selectFromDropdown('//*[text()="dropdown"]', 'Option 1');
            driver.selectFromDropdown('//*[text()="dropdown"]', '//*[text()="Option 1"]');
        */
        var menuItemLocator = menuItem.indexOf('/') == 0 
            ? menuItem 
            : '//div[@role="menu"]//span//div[text()="' + menuItem + '"]';

        await driver.click(menuLocator)
        await driver.pause(750)
        let exists = await driver.internalWaitForExist(menuItemLocator, 2000);
        if (exists){
            await driver.click(menuItemLocator);
            return driver.pause(2000); // delay to dismiss animation (div can block)
        } 
        else if (menuItem.indexOf('/') !== 0){ // xpaths start with / at index 0
            // Some react apps have different menu dropdowns.  Try this method if user didn't pass in an xpath for menuItem
            menuItemLocator = '//*[contains(@data-component-id, "dropdown-item")]//div[text()="' + menuItem + '"]';
            exists = await driver.internalWaitForExist(menuItemLocator, 2000);
            if (exists){
                await driver.click(menuItemLocator);
                return driver.pause(2000); // delay to dismiss animation (div can block)
            } 
        }
        return driver.keys(['Up arrow', 'Enter']).then(() => {
            throw new Error('selectFromDropdown could not find: ' + menuItemLocator);
        });
    },

    pressKey: async function(){
        /*
        press any keyboard key multiple times
        :Arg:
            - key   : Ex. 'Tab', 'Escape','Down arrow', 'Right arrow', 'Enter', etc.
            - numb  : (optional) number of times key should be pressed
                      Default Value: 1
            - delay : (optional) delay between pressing the same key
                      Default Value: 50
        :usage:
            - pressKey('Tab',4,100)
        */
        var key = arguments[0]
        var numb = isNaN(arguments[1]) ? 1 : arguments[1];
        var delay = isNaN(arguments[2]) ? 50 : arguments[2];

        for(var i = 0; i < numb; i++) {
            await driver.keys(key)
            await driver.pause(delay);
        };
    },

    

    selectApp: async function(){
        /*  Opens the app from the appdashboard
        :Args:
            - appname: the string name of the app
            - server (optional): used if your app is accessed directly by URL
            - extras (optional): extra URL parameters to append
            - microSanity (optional): set for MicroSanity runs
         */
        var appname = arguments[0];
        var urlname = appname;
        var server = typeof arguments[1] === "string" ? arguments[1] : __SERVER;
        var extras = typeof arguments[2] === "string" ? arguments[2] : "";
        var microSanity = typeof arguments[3] === "boolean" ? arguments[3]: false;
        var selectTimeout = 60000;    

        var dashheader = '//*[contains(@eventproxy, "Header")]';
        var tempUrlPort = ':8543'; // used when inputting the URL

        if (appname === "ServiceSupervision"){           
            appname = 'nms_webapp_servicessupervisionLaunch';
            urlname = 'ServiceSupervision';
            tempUrlPort = ':8544';
        }
        else if (appname === "FaultManagement"){         
            appname = 'nms_webapp_fmLaunch'
            urlname = 'FaultManagement';
            tempUrlPort = ':8544';
        }
        else if (appname === "EquipmentView"){           
            appname = 'nms_webapp_equipmentviewLaunch';
            urlname = 'EquipmentView';
        }
        else if (appname === "XRSPowerManagement"){      
            appname = 'nms_webapp_powermanagement_dashboardLaunch'
            urlname = 'XRSPowerManagement';
        }
        else if (appname === "Inventory"){               
            appname = 'nms_webapp_dcinventoryLaunch';
            urlname = 'dcinventory';
        }
        else if (appname === "ServiceNavigator"){        
            appname = 'nms_webapp_dcservicenavigatorLaunch';
            urlname = 'dcservicenavigator';
        }
        else if (appname === "nfvmgmt"){                 
            appname = 'nms_webapp_nfvmgmtLaunch';
            urlname = 'VNFManager';
        }
        else if (appname === "nfvsupervision"){          
            appname = 'nms_webapp_nfvsupervisionLaunch';
        }
        else if (appname === "Wireless Supervision"){    
            appname = 'nms_webapp_nesupervisionLaunch';
            urlname = 'WirelessSupervision';
        }
        else if (appname === "Wireless NE Views"){       
            appname = 'nms_webapp_wirelessneviewsLaunch';
            urlname = 'WirelessNEViews';
        }
        else if (appname === "Subscriber Management"){   
            appname = 'nms_webapp_esmdashboardLaunch'
            urlname = 'SubscriberManagement';
        }
        else if (appname === "NetworkSupervision"){      
            appname = 'nms_webapp_network_monitorLaunch';
            urlname = 'NetworkSupervision';
            tempUrlPort = ':8544';
        }
        else if (appname === "Golden Config"){           
            appname = 'nms_webapp_goldenconfigLaunch';
            urlname = 'GCSnapshotManager';
        }
        else if (appname === "CpbApp"){                  
            appname = 'nms_webapp_cpbappLaunch';
        }
        else if (appname === "Analytics") {              
            appname = 'nms_webapp_analyticsLaunch';
        }
        else if (appname === "Utilization Stats"){       
            appname = 'nms_webapp_utilization_statsLaunch';
            urlname = 'utilizationStats';
        }
        else if (appname === "SystemMonitor"){
            return driver.url(_urlProtocol + "://" + server + tempUrlPort + "/systemMonitor/").internalWaitForExist(dashheader, selectTimeout);
        }
        else if (appname === "Showcase"){
            return driver.url(_urlProtocol + "://" + server + tempUrlPort + "/showcase/").internalWaitForExist(dashheader, selectTimeout);
        }
        else if (appname === "mapfwk-map3d-isc") {
            if (extras === "mapServer") {
                urlname = "mapfwk-map3d-isc/mf-index.html";
            }
            else {
                urlname = "mapfwk-map3d-isc";
            }
        }

        var urlnameXpath = '//*[@id="' + urlname + '" or contains(@href, "' + urlname + '")]/parent::*';
        if (microSanity){
            return driver
                .secureUrl(_urlProtocol + "://" + server +  "/" + urlname + "/" + extras)
                .login("admin", global.__ORBW_PASSWORDS['root']['web']);
        }

        var isExisting = await driver.internalWaitForExist(urlnameXpath, selectTimeout);
        if(isExisting){
            await driver.pause(5000)
            var retClick = await driver.execute(function(id){
                var e = document.getElementById(id).getElementsByTagName('img')[0];
                if (e){
                    e.click();
                    return true;
                } else {
                    return false;
                }
            }, urlname)
            if (!retClick.value){
                await driver.click(urlnameXpath);
            }
            await driver.pause(5000);
        } else {
            await driver.url(_urlProtocol + "://" + server + tempUrlPort +  "/" + urlname + "/" + extras);
        }

        await driver.pause(5000) // allow time for redirect
        await driver.internalWaitForExist('/html/body//*/div', 30000)
        await driver.pause(5000)

        var hasoverride = await driver.execute(function(){ // Special case for IE to click the override link
            var x = document.getElementById('overridelink') || document.getElementById('proceed-link')
            if (x) {
               x.click();
               return true;
            }
            return false;
        });

        if (hasoverride.value === true){
            await driver.pause(10000)
        }

        let ret = await driver.url();
        if (ret.value.indexOf("cas/login") >= 0){
            console.log("Redirected back to the login page: " + ret.value + "<br />");

            // flip the password to NSP for admin user
            _defaultPassword = global.__ORBW_PASSWORDS['root']['web'];

            await driver.internalWaitForExist(_usernameXpath, selectTimeout);
            await driver.setValue(_usernameXpath, _defaultUser);
            await driver.pause(500);
            await driver.internalWaitForExist(_passwordXpath, 15000); // ie11 loads username seconds before password
            await driver.setValue(_passwordXpath, _defaultPassword);
            await driver.pause(500);
            await driver.webguiScreenshot("Credentials entered");
            await driver.click(_loginButtonXpath);
            await driver.pause(3000);
            await driver.refresh();
            await driver.webguiScreenshot("post refresh");

            var exists = await driver.internalWaitForExist(dashheader, selectTimeout);
            if (!exists){
                console.log("login did not automatically redirect to app, clicking app icon again...");
                await driver.webguiScreenshot("post internalWaitForExist dashheader");
                await driver.click(urlnameXpath);
                await driver.pause(5000);
                await driver.internalWaitForExist(dashheader, selectTimeout);
            }
            var warningRet = await driver.checkWarning();
            if (warningRet !==  false){
                console.log("<br /><b>Warning Message present after selectApp:</b><br />" + ret);
            }

        } else {
            var exists = await driver.internalWaitForExist(dashheader, selectTimeout);
            if (!exists){
                console.log("<br />App did not open from .click(), attempt URL navigation<br />");
                await driver.url(_urlProtocol + "://" + server + tempUrlPort +  "/" + urlname + "/" + extras);
            }
        }

        if (urlname.indexOf('mapfwk') >= 0 && extras != 'alum2d-index.html'){
            await driver.execute(function(){
                window.location.reload(true);  // true means get fresh information from server not cache
            })
            await driver.internalWaitForExist('//*[contains(@eventproxy, "isc_ToolStrip_")]', selectTimeout);
        }
    },
    
    startApp : async (locator='#startAppButton') => {

        let exists = await driver.internalWaitForExist('iframe', 10000);
        if (!exists){
            console.log('StartApp iframe element not found');
            return false;
        }
        
        let ele = await driver.element('iframe');
        await driver.frame(ele.value)  // change focus to iframe
        await driver.waitForVisible(locator, 5000);
        await driver.click(locator);
        await driver.frame();    // change focus back to page's default context
        return true;
    },


    configSettings: async function(){
        /*  
            Intializes the browser window size and returns the IP of the assigned VM (if running on the grid)
        */

        var ret = await driver.execute(function(property) {
            return navigator[property];
        }, 'userAgent');

        if (ret) 
            console.log(ret.value + " \n");
                
        if (__ON_GRID === true)
        {
            ret = await driver.gridTestSession();

            return new Promise((resolve, reject) => {
                var postRequest = {
                    host    : __SELENIUMHOST,
                    path    : '/grid/api/testsession',
                    port    : __SELENIUMPORT,
                    method  : 'POST',
                    headers : { 'Content-Type': 'application/json; charset=UTF-8' }
                };
                var buffer = '';
                var req = http.request(postRequest, (res) => {
                    var buffer = '';
                    res.on("data", (data) => { buffer += data; });
                    res.on("end", (data) => {
                        var worker = JSON.parse(buffer)['proxyId'].replace('http://','');
                        console.log('Running on grid worker: ' + worker + "\n");
                        resolve(worker.split(':')[0]);
                    });
                });
                req.write(JSON.stringify(ret));
                req.end();
            })
        }
        
    },

    clickElement: async function(element){
        /*  Clicks a web element given an XPATH, after waiting for it to be clickable for 10s
        :Args:
            - element: the XPATH of the parent smartclient object
        :Returns:
            - The return of the response
        :Usage:
            -  driver.clickElement('*[eventproxy="isc_Button_0"]')
        */
        await driver.internalWaitForExist(element, 10000)
        await driver.click(element)
    },

    setUserPreferencesOptions: async function(options){
        /*
            setUserPreferencesOptions()
                - open user preferences and set the options
                - By default options will be saved.To close without setting options, pass 'closeButton' as true

            @param
                - options: options passed to set in user preferences window
                  - polling : polling time as string '30' or int 30
                  - language : langauge to be set from dropdown
                  - showRowColors : set the value of the checkbox to true or false
                  - closeButton : close the system preferences instead of saving

            @description
                from test case you will pass options you want to set
                 - options = {'polling':'10','language':'en'}
                 - options = {'polling':'10','language':'zh','showRowColors':true,'closeButton':true}
                And you will call function:
                 -  setUserPreferencesOptions(options)
        */
        var keys = Object.keys(options);
        var launchpadAction = 'save';

        if (options['closeButton'] && keys.indexOf('closeButton') >= 0 ){
            saveLocator = closeLocator;
            launchpadAction = 'cancel';
        }

        await driver.openPreferences('User preferences');        
        await common.launchpad.setCategoryValues(options, launchpadAction);
        return common.launchpad.closeLaunchpadSettings();

    },


    restoreToSystemSettings : async function()
    {
        /* restoreToSystemSettings()
          
           driver function opens user preferences in Dashboard and clicks on the Restore to System Settings button
           which results in setting the preference options to the system default and a page refresh
         */
        await driver.openPreferences('User preferences');
        await driver.setCategoryValues({}, 'restore');
        await driver.closeLaunchpadSettings();
    },

    getUrlProtocol: async function() {
        /*
          getUrlProtocol()
         
          Returns http or https depending on the contents of the current url.
        */
        var protocol = 'http';

        var sslUrl = driver.url();
        if (sslUrl.value.indexOf('https') === 0) {
            protocol = 'https';
        }

        return protocol;
    },


    getTooltipText: async function(){
        /* getTooltipText()
          
          Presses Shift+F1 keys to open the tooltip for currently focused component, Used for keyboard
          accessiblity tests
          
          @return returns with an object containing, a boolean isVisible 
                          if tooltip is visible and a tooltipText string. 
        */

        var retValue = {isVisible:false, tooltipText:''};

        var isVisible = await driver.isTooltipVisible(true);
        var text = await driver.getText(_tooltip_XP)

        retValue.isVisible = isVisible;
        retValue.tooltipText = text;
        return retValue;
    },

    isTooltipVisible: async function(){
        /**
         * isTooltipVisible()
         * 
         * Checks if a tooltip is visible on browser screen
         * 
         * @param pressKeys Optional boolean parameter if true presses Shift+F1 keys to open the tooltip of focused component
         * @return boolean value indicating if tooltip is visible 
         */
        var pressKeys = typeof (arguments[0]) === "boolean" ? arguments[0] : false;

        if(pressKeys)
        {
            await driver.keys(['Shift','F1']); // open tooltip
            await driver.pause(500);
            await driver.keys('Shift'); //release shift key
            await driver.pause(100);
        }

        return driver.isVisible(_tooltip_XP);
    },

    checkWarning: async function(){
        /* Dismisses a visible warning, and returns the text
           Args
           [0] isClickOk: boolean. Optional.
                      If not true: we expect a Cancel button or a dialog with only an OK button.
                      If true: we expect a dialog with a Cancel and OK button and will click OK.
           [1] showBrowserLogs: show the browser logs
        */
        
        // First check if this is react
        var baseXpath = '//*[contains(@class, "ReactModal__Content ReactModal__Content--after-open")]';
        var warningExists = await driver.internalWaitForExist(baseXpath, 1000);
        if (warningExists){
            return checkWarningReact(arguments[0], arguments[1]);
        }
        
        var isClickOk = arguments[0] === true ? '2' : '1',
            showBrowserLogs = arguments[1] === true;

        var dialog_xpath = '//*[@role="alertdialog"]',
            dialogLabel_xpath = dialog_xpath + '//*/td[@class="dialogLabel"]',
            dialogButton_xpath = dialog_xpath + '//*/div[@role="button"][' + isClickOk + ']';

        // First verify the xpath exists
        var isExisting = await driver.internalWaitForExist(dialog_xpath, 2000)
        if (isExisting === false || isExisting === null) {      // No warning
           return false;
        }

        // Then verify it's visible.  Smart Client hides old warnings
        var isVisible = await driver.internalWaitForVisible(dialog_xpath, 2000)
        if (isVisible === false || isVisible === null) {      // No warning
           return false;
        }
        
        // There is a pop-up dialog, get the text, dismiss and return
        await driver.webguiScreenshot("Check Warning Screenshot");
        var msg = await driver.getText(dialogLabel_xpath);
        
        // Match the time stamp and extract the message
        let timeRegex = /(Time:[^\)]+\))([\s|\S]+)/g;
        let m = timeRegex.exec(msg);
        if (m && m.length === 3){ // 0 = full string, 1 = time, 2 = message
            msg = m[2].trim();
        }
        
        if (msg.indexOf(NSP_COMMUNICATION_ERROR_MSG) >= 0){
            NSP_COMMUNICATION_ERROR = true;
            console.log(msg);
        }
        if ((showBrowserLogs || NSP_COMMUNICATION_ERROR) && __BROWSER.toLowerCase().indexOf("ie") === -1){
            await driver.log("browser").then(function(ret){
                console.log("<b>Browser logs:</b><br />", ret);
            });
        }
        await driver.click(dialogButton_xpath);
        return msg;
    },

    secureUrl: async function(url, retries=0){

        // Special case for IE to click the override link
        var certCheck = function(){ 
           var x = document.getElementById('overridelink') || document.getElementById('proceed-link')
           if (x) {
               x.click();
               return true;
           }
           return false;
        };
    
        let wasUnknownDriverErrorFound = false;
        await driver.url(url).catch(e => {
            // Newer versions of firefox can potentially throw unknown server error when loading bad cert https.  
            // "Driver info: driver.version: unknown" <-- dead session
            wasUnknownDriverErrorFound = true;
            console.log("<br />Exception in secureUrl(): retry #" + (retries + 1) + "<br />");
        });

        // Retry up to 5 times as this is an intermittent geckodriver issue
        if (wasUnknownDriverErrorFound && retries < 5){
            await driver.end();
            await driver.pause(1500);
            await driver.init()
            return driver.secureUrl(url, retries + 1);
        }

        await driver.pause(3000);
        let ret = await driver.execute(certCheck);

        if (ret.value === true){
            await driver.url(url).catch(e => {
                // same comment as above
                console.log("<br />Caught second unknown server error in secureUrl:", e, "<br />");
            });
            await driver.execute(certCheck); // some vsams redirect a second time
            await driver.pause(7000);
        }
    },


    closeWindowsNotSpecified: async function(handleId){
        /* Gets a list of the window handles and closes the Windows that are NOT the specified parameter
           Intended to be used as a cleanup method for openHelpAppFromBanner
           Args: handleId (string) window handle ID to remain open and be active
           Returns: (boolean) false if a window cannot be closed, true otherwise
        */
        var retVal = false;
        var initialHandleList = await driver.windowHandles();
        if (handleId === null || initialHandleList.value.length < 2 || initialHandleList.value.indexOf(handleId) === -1) {
            console.log('Unable to close a window');
        }
        else {
            for (var i = 0; i < initialHandleList.value.length; i++){
                await driver.window(initialHandleList.value[i]);
                if (initialHandleList.value[i] !== handleId) {
                    await driver.close();
                    await driver.pause(1000);
                    retVal = true;
                }
            }
            await driver.window(handleId);
        }
        return retVal;
    },

    openPreferences: async function(option)
    {
        return common.launchpad.openPreferences(option);
    },

    setSystemPreferencesOptions: async function(options){
        /*
        :Purpose:
            - open system preferences and set the options
            - By default options will be saved.To close without setting options, pass 'closeButton' as true

        :Args:
            - options: options passed to set in system preferences window
              - polling : polling time as string '30' or int 30
              - language : langauge to be set from dropdown
              - showRowColors : set the value of the checkbox to true or false
              - closeButton : close the system prefernes instead of saving

        :Usage:
            from test case you will pass options you want to set
             - options = {'polling':'10','language':'en'}
             - options = {'polling':'10','language':'zh','showRowColors':true,'closeButton':true}
            And you will call function:
             -  setSystemPreferencesOptions(options)
        */

        var keys          = Object.keys(options);
        var launchpadAction = 'save';

        if (options['cancelButton'] && keys.indexOf('cancelButton') >= 0 ){
            launchpadAction = 'cancel';
        }

        await driver.openPreferences('System settings');
        await common.launchpad.setCategoryValues(options, launchpadAction)
        return common.launchpad.closeLaunchpadSettings();

    },


    getColorPreferences: async function() {
        /* getColorPreferences: Gets current colour values for each alarm category.
         Returns:
             - foreground and background colours for each of the alarm categories.
         */
        await driver.openPreferences('System Color Settings');

        var alarmColors = await common.launchpad.getSystemAlarmColors();
        await common.launchpad.closeLaunchpadSettings();

        return alarmColors;
    },

    setColorPreferences: async function() {
        /*
            Sets random colours for each field, returning a map of the values
        */
        var ret = [];

        await driver.openPreferences('System Color Settings')
        return common.launchpad.assignRandomAlarmColors();
    },

    setDefaultColorPreferences: async function() 
    {
        await driver.openPreferences('System Color Settings')
        return common.launchpad.setDefaultAlarmColors();
    },

    getEmailServerSettings: async function() {
        /* Gets the current e-mail server settings from launchpad settings
            Returns:
             - array of e-mail server setting objects
         */
        return common.launchpad.getEmailServerSettings();
    },

    setEmailServerSettingsOptions: async function(options, action) {
        /* Sets launchpad settings E-mail Server settings with the provided options
             Args:
                - options (object) containing keys/values to be applied and saved
                    - options keys must be 'emailServer', 'username','emailAddress', 'password'
                    - options values must be of type string
                - action (string) either 'save' or 'discard'
            Usage:
                - options = {'emailServer':'135.121.123.123', 'username':'jdoe', 'emailAddress':'jdoe@abc.com, 'password':'abc123'}
                with setEmailServerSettingsOptions(options, 'save')
        */
        return common.launchpad.setEmailServerSettingsOptions();
    },

    getColorRGBValues: async function(){
        /*
        Returns:
         - the object with severity names and there correspondng rgb color values from color table
        example:
         - {conditionBackgrnd:rgb(254,125,30),criticalForegrnd:rgb('120,0,0'),....}
        */
        return common.launchpad.getSystemAlarmRGBColors();
    },
    

    /********************************************************************************
     ********************************************************************************
 
     *                       SMARTCLIENT FUNCTIONS

        The below functions are only applicable to smartclient apps.  If your app
        is React based, do not use these functions!

     ********************************************************************************
     ********************************************************************************/   

    resolveScLocator: async function(){
        /*  Returns a child's smartclient locator, given a parent locator, child attribute, and child value of said attribute
        :Args:
            - locator: the locator of the parent smartclient object
            - attribute: the name of the attribute from the child's smartclient object
            - value: the value associated with the above attribute
        :Returns:
            - The locator of the found child
        :Usage:
            -  driver.resolveScLocator('//[ID="isc_alu_nms_ListPanel_0"]', 'name', 'Search')
              >>> '/[ID="isc_alu_nms_ListPanel_0"]/member[Class=Button||name=Search]/'
        */
        var locator = arguments[0];
        var attr = arguments[1];
        var value = arguments[2];
        
        var ret = await driver.execute(function(loc, a, v)
        {
            var element;
            if (alu.nms) {
                element = alu.nms.SamAutoTest.samFindDOMChildOfLocator(loc, a, v);
            }
            else {
                element = isc.AutoTest.samFindDOMChildOfLocator(loc, a, v);
            }
            return isc.AutoTest.getLocator(element);
        }, locator, attr, value);

        if (ret.value === "" || ret.value === undefined){
            console.log('[WARN] resolveScLocator: Locator not found!', JSON.stringify(arguments));
            return ret.value;
        }

        if (ret.value.indexOf("may be busy") >= 0){
            // "A script on this page may be busy, or stopped responding"
            console.log('[WARN] resolveScLocator: ', ret.value);

            if (__BROWSER.toLowerCase().indexOf("ie") === -1){
                var logs = await driver.log("browser");
                console.log("<b>Browser logs:</b><br />", logs);
            }

            if (arguments[3] === true){
                throw new Error("[FAIL] resolveScLocator could not determine the locator")
            }
            else {
                await driver.pause(10000);
                return driver.resolveScLocator(locator, attr, value, true);
            }
        }

        return ret.value;
    },

    resolveIdFromScLocator: async function(){
        /*  Returns a child's element ID, given a parent locator, child attribute, and child value of said attribute
        :Args:
            - locator: the locator of the parent smartclient object
            - attribute: the name of the attribute from the child's smartclient object
            - value: the value associated with the above attribute
        :Returns:
            - The element ID of the found child
        :Usage:
            -  driver.resolveIdFromScLocator('//[ID="isc_alu_nms_ListPanel_0"]', 'name', 'Search')
              >>> 4
        */
        var locator = arguments[0];
        var attr    = arguments[1];
        var value   = arguments[2];

        var ret = await driver.execute(function(loc, a, v)
        {
            if (alu.nms) {
                return alu.nms.SamAutoTest.samFindDOMChildOfLocator(loc, a, v);
            }
            else {
                return isc.AutoTest.samFindDOMChildOfLocator(loc, a, v);
            }
        }, locator, attr, value);
        if (!ret.value){
            throw new Error('resolveIdFromScLocator: Element not found!' + JSON.stringify(arguments));
        }
        
        // IE11 returns an array because reasons
        return ret.value instanceof Array ? ret.value[0].ELEMENT : ret.value.ELEMENT;
    },

    getIdFromScLocator: async function(){
        /*  Returns the element ID, given a locator
        :Args:
            - locator: the locator of the parent smartclient object
        :Returns:
            - The element ID
        :Usage:
            -  driver.getIdFromScLocator('//[ID="isc_alu_nms_ListPanel_0"]')
              >>> 3
        */
        var locator = arguments[0];
        var ret = await driver.execute(function(loc)
        {
           return isc.AutoTest.getElement(loc);
        }, locator);
 
        if (!ret.value){
            throw new Error("Could not find element with locator: " + locator);
        }

        return ret.value.ELEMENT;
    },

    getDOMIdFromScLocator: async function(){
        /*  Returns the DOM Id, given a locator
        :Args:
            - locator: the locator of the parent smartclient object
        :Returns:
            - The DOM ID
        :Usage:
            -  driver.getDOMIdFromScLocator('//[ID="isc_alu_nms_ListPanel_0"]')
              >>> "isc_4U"
        */
        var locator = arguments[0];

        var ret = await driver.execute(function(loc)
        {
           return isc.AutoTest.getElement(loc).id;
        }, locator);

        return ret.value;
    },

    isScLocatorClickable: async function(){
        /* Returns True or False, if the given sclocator is clickable */
        var locator = arguments[0];
        var ret = await driver.execute(function(loc)
        {
            if (isc.AutoTest.getElement(loc)){ // prevent IE popup
                return isc.AutoTest.isElementClickable(loc);
            }
            return false;
        }, locator);

        if (ret && typeof ret.value === "boolean"){
            return ret.value;
        }
        else {
            return false;
        }
        
    },

    _isGridDone: async function(){
        // INTERNAL function: checks if grid is done once
        var locator = arguments[0];

        var ret = await driver.execute(function(loc)
        {
           return isc.AutoTest.isGridDone(loc);
        }, locator);

        if (ret.value === null)
            return false;
        else
            return true;
    },

    waitForScLocator: async function(){
        /*  Waits for a smartclient locator to be clickable.
            ********** isScLocatorClickable() WILL CAUSE getLocator() POPUPS IN IE
        :Args:
            - locator: the locator of the sc element
        :Returns:
            - Nothing, but times out after POLLING amount of time
        :Usage:
            -  driver.waitForScLocator('//[ID="isc_Button_0"]')
        */
        var locator = arguments[0];

        for (var i=0; i < parseInt(POLLING/INTERVAL); i++)
        {
            var ret = await driver.isScLocatorClickable(locator);

            if (ret === true){
                return true;
            }
            else {
                if (__BROWSER.indexOf('ie') > -1){
                    await driver.checkWarning();
                }
                await driver.pause(INTERVAL);
            }
        }

        if (__BROWSER.indexOf('ie') > -1){
            await driver.checkWarning();
        }

        return false;
    },

    waitForGridDone: async function(){
        /* Polls the grid, returns when the Grid is done (i.e. ListGrid)
        :Args:
            - locator: the sc locator of the grid
        :Returns:
            - true or false , if the grid finished in time
        */
        var locator = arguments[0];

        var isDone = false;         // Tells us to stop executing _isGridDone
        var sleepTime = INTERVAL;   // Prevents sleeping (used with isDone)
        var limit = parseInt(POLLING_GRID/INTERVAL);


        for (var i=0; i < limit; i++)
        {
            await driver.pause(sleepTime)
            var ret = await driver._isGridDone(locator);

            if (ret === true){
                // double check, sometimes the code executes before grid updates
                await driver.pause(sleepTime / 2)
                var ret = await driver._isGridDone(locator);

                if (ret === true){
                    return true;
                }
            }
        }
        return false;
    },

    focusScLocator: async function(locator){
        /* Brings a smartclient object into focus (when scrolled out of view)
        :Args:
            locator: smartclient locator of the object
        */
        return driver.execute(function(loc)
        {
            if (isc.AutoTest.getObject(loc).focus)
                isc.AutoTest.getObject(loc).focus();
        }, locator);
    },

    scrollToLocator: async function(locator) {
        /* Scrolls to an element that is not in view.
         :Args:
         locator: smartclient locator of the object
         */
        return driver.execute(function(loc)
        {
            if (isc.AutoTest.getElement(loc).scrollIntoView)
                isc.AutoTest.getElement(loc).scrollIntoView();
        }, locator);
    },

    clickElementByScLocator: async function(locator, retry){
        /*  Clicks a smartclient element at the given locator
        :Args:
            - locator: the locator of the parent smartclient object
        :Returns:
            - The return of the response
        :Usage:
            -  driver.clickElementByScLocator('//[ID="isc_Button_0"]')
        */
        var locator = arguments[0];

        await driver.pause(500)
        
        var ret = await driver.execute(function(loc){
            return isc.AutoTest.getElement(loc);
        }, locator);

        /* Debugging */
        if (ret.value === null || ret.value === undefined) {
            if (retry !== true){               
                console.log("clickElementByScLocator: could not find element, retry..");
                await driver.pause(500)
                await driver.clickElementByScLocator(locator, true);
            } else {
                throw new Error("clickElementByScLocator: Could not find element at " + locator);
            }
        }
        else {
            await driver.elementIdClick(ret.value.ELEMENT);
        }
    },

    clickMenuItem: async function(item, level, column){
        // Clicks an item in an already-open Menu
        // If the item is in a submenu, specify level=1
        // Optionally specify the column index (default=0)
        if (typeof level !== "string" && typeof level !== "number"){
            level = 0;
        }
        if (typeof column !== "string" && typeof column !== "number"){
            column = 0;
        }

        var locator = '//Menu[level=' + level + ']/body/row[title='+ item +']/col[' + column + ']';

        // Try data click first
        var ret = await driver.execute(function(loc, title)
        {
            // First test that the object is good
            var obj = isc.AutoTest.getObject(loc);
            if (!obj){
                return false;
            }

            var data = obj.data;
            for (var i = 0; i < data.length; i++)
            {
                if (data[i].click && data.title === title)
                {
                    data[i].click();
                    return true;
                }
            }
            return false;

        }, locator, item)

        await driver.pause(500);

        // data click was not successful
        if (!ret.value){
            let isClickable = await driver.waitForScLocator(locator)
            if (isClickable){
                await driver.clickElementByScLocator(locator);
                await driver.pause(500);
            }
            else {
                await driver.click('//*[contains(@eventproxy, "_Menu_")]//*[text()="' + item + '"]');
                await driver.pause(500);
            }

        }
    },

    rightClickElementByScLocator: async function(){
        /*  Right Clicks (context clicks) a smartclient element at the given locator, by finding its id
        :Args:
            - locator: the locator of the parent smartclient object
        :Returns:
            - The return of the response
        :Usage:
            -  driver.clickElementByScLocator('//[ID="isc_Button_0"]')
        */
        var locator = arguments[0];

        var id = await driver.getDOMIdFromScLocator(locator);
        return driver.rightClick('//*[@id="'+ id +'"]');
    },

    clickChildByScLocator: async function(){
        /*  Clicks a smartclient object, given a parent locator, child attribute, and child value of said attribute
        :Args:
            - locator: the locator of the parent smartclient object
            - attribute: the name of the attribute from the child's smartclient object
            - value: the value associated with the above attribute
        :Returns:
            - The ID of the found child
        :Usage:
            -  driver.clickChildObjectByScLocator('//[ID="isc_alu_nms_ListPanel_0"]', 'name', 'Search')
              >>> '/[ID="isc_alu_nms_ListPanel_0"]/member[Class=Button||name=Search]/'
        */
        var locator = arguments[0];
        var attr = arguments[1];
        var value = arguments[2];

        var id = await driver.resolveIdFromScLocator(locator, attr, value);

        await driver.elementIdClick(id);
    },

    selectFromDropdownByScLocator: async function(){
        /*  Opens the picker then selects the element [locator] found at the given [row]
        :Args:
            - locator: location in the DOM of the element to be clicked
            - row: row # or search criteria
        :Usage:
            - selectFromDropdownByScLocator('//[ID="svcsup_SummaryView_1"]/item[name=viewChooser]', 1)
            - selectFromDropdownByScLocator('//[ID="svcsup_SummaryView_1"]/item[name=viewChooser]', "displayedName=" + sumname)
        */
        var locator = arguments[0];
        var row = '/pickList/body/row[' + arguments[1] + ']/col[0]';

        await driver.pause(500);
        await driver.waitForScLocator(locator + '/[icon="picker"]');
        await driver.clickElementByScLocator(locator + '/[icon="picker"]');
        await driver.waitForGridDone(locator + '/pickList/body/');

        var ready = await driver.waitForScLocator(locator + row);
        // In some scenarios, an action on the OS will close a picklist. driver is a retry
        if (!ready){
            await driver.clickElementByScLocator(locator + '/icon="picker"]')
            await driver.waitForScLocator(locator + row);
        }
        await driver.clickElementByScLocator(locator + row);
    },

    filterAndSelectFromDropdownByScLocator: async function(){
        /*  Opens the picker then selects the element [locator] found at the given [row]
        :Args:
            - locator: location in the DOM of the element to be clicked
            - row: row # or search criteria
        :Usage:
            - filterAndSelectFromDropdownByScLocator('//[ID="svcsup_SummaryView_1"]/item[name=viewChooser]', 1)
            - filterAndSelectFromDropdownByScLocator('//[ID="svcsup_SummaryView_1"]/item[name=viewChooser]', "displayedName=" + sumname)
        */
        var locator = arguments[0];
        var row = String(arguments[1]);
        var rowLocator = '/pickList/body/row[' + row + ']/col[0]';
            
        await driver.clickElementByScLocator(locator + '/[icon="picker"]')
        await driver.pause(500)

        if (row.indexOf("=") > -1) {
            await driver.setValueByScLocator(locator, row.split("=")[1]);
            await driver.pause(500);
        }

        // Test if the locator exists, if not, use the toLowerCase() version of @row
        var exists = await driver.execute(function(loc)
        {
            return isc.AutoTest.getElement(loc) != null;
        }, locator + rowLocator);

        // Backwards compatibility for previously working code: toLowerCase()
        if (!exists.value){
            rowLocator = '/pickList/body/row[' + row.toLowerCase() + ']/col[0]';
        }   
    
        var ready = await driver.waitForScLocator(locator + rowLocator);
        // In case the picker closed by an OS level action
        if (!ready){
            await driver.clickElementByScLocator(locator + '/[icon="picker"]')
            await driver.waitForScLocator(locator + rowLocator)
        }
        await driver.clickElementByScLocator(locator + rowLocator)
    },

    setValueByScLocator: async function() {
        /*
         Sets the value of a textfield.
         If no string is specified, or the string is empty (""), the value is cleared
         :Args:
         - locator: location in the DOM of the element to be clicked
         - value: the text to enter
         :Usage:
         - setValueByScLocator('//[ID="isc_TextItem_0"]', "Some Text") sets the textfield
         - setValueByScLocator('//[ID="isc_TextItem_0"]', "") clears the textfield
         */
        var locator = arguments[0];
        var value = arguments[1];

        var id = await driver.getDOMIdFromScLocator(locator);

        var xpath = '//*[@id="'+ id +'"]';

        await driver.internalWaitForExist(xpath,5000);
        await driver.clearElement(xpath);
        await driver.pause(50);

        // This click is to change the state of the textbox from "hint" to "editable"
        // Some components throw an intercept error on this click, so catch and release
        await driver.click(xpath).catch(e => {});

        await driver.pause(250);
        await driver.setValue(xpath, value);
    },

    filterDateByScLocator: async function(){
        /*  Opens a date picker (at locator) then filters the rows after pressing 'clearButton'
        :Args:
            - locator: location in the DOM of the element to be clicked
            - fromRow: date (string) to enter in the FROM field
            - toRow: date (string) to enter in the TO field
            :Optional:
            - buttonPress: Which button to press. One of: 'okButton','cancelButton'
        :Usage:
            - filterDateByScLocator('//[ID="isc_alu_nms_ListPanel_0_listGrid_o"]/filterEditor/editRowForm/item[name=dateTime]','2014/11/06 12:34:56','2014/11/07 13:45:57')
        */
        var locator = arguments[0];
        var fromRow = arguments[1];
        var toRow = arguments[2];
        var buttonPress = arguments[3];
        var loc = locator.split('/textbox')[0] //splitting original locator in order to access range dialog form in material design

        // Default to 'okButton' if not specified
        if (typeof buttonPress !== "string")
            buttonPress = 'okButton';

        await driver.clickElementByScLocator(locator)
        await driver.clickElementByScLocator(loc + '/rangeDialog/clearButton')
        var id = await driver.getDOMIdFromScLocator(loc + '/rangeDialog');

        // This is here to verify we're accessing the correct form (when different datetime fields open, their forms are hidden)
        var parent = '//*/div[@id="' + id + '"]';

        await driver.setValue(parent + '//*/input[@name="fromField_dateTextField"]', fromRow);
        await driver.pause(500);
        await driver.setValue(parent + '//*/input[@name="toField_dateTextField"]', toRow);
        await driver.pause(500);
        await driver.click(parent + '//*/input[@name="toField_dateTextField"]');
        await driver.pause(500);
        await driver.clickElementByScLocator(loc + '/rangeDialog/' + buttonPress);
    },

    getObjectAttributeByScLocator: async function(){
        /*  Returns the attribute of an object, given a locator
        :Args:
            - locator: the locator of the smartclient object
            - attribute: the attribute to retrieve from the smartclient object
        :Returns:
            - The value of the attribute
        :Usage:
            -  driver.getObjectAttributeByScLocator('//[ID="isc_Button_0"]', 'title');
              >>> "Components"
        */
        var locator = arguments[0];
        var attribute = arguments[1];


        var ret = await driver.execute(function(loc, a)
        {
            return isc.AutoTest.getObject(loc)[a];
        }, locator, attribute);
        
        return ret.value;
    },

    getChildObjectAttributeByScLocator: async function(){
        /*  Returns the attribute of an object, given a parent locator, child attribute, child value and object attribute for child object
        :Args:
            - locator:   the locator of the parent object
            - attr:      the name of the attribute from the child's object
            - value:     the value associated with the above attribute
            - objAttr:   the attribute to retrieve from the child object
        :Returns:
            - The value of the attribute
        :Usage:
            - driver.getChildObjectAttributeByScLocator('//[ID="isc_alu_nms_ListPanel_0"]', 'name', 'Search','_value')
        */
        var locator  = arguments[0];
        var attr     = arguments[1];
        var value    = arguments[2];
        var objAttr  = arguments[3];

        var loc = await driver.resolveScLocator(locator, attr, value);

        return driver.getObjectAttributeByScLocator(loc, objAttr);
    },

    getElementInnerHTMLByScLocator: async function(){
        /*  Returns the innerHTML of an element, given a locator
        :Args:
            - locator: the locator of the element
        :Returns:
            - The innerHTML
        :Usage:
            -  driver.getElementInnerHTMLByScLocator('//[ID="isc_Button_0"]');
              >>> "<div>Some Text</div>"
        */
        var locator = arguments[0];
        var ret = await driver.execute(function(loc)
        {
            var e = isc.AutoTest.getElement(loc);
            if (e){
                return e.innerHTML;
            }
            return null;
        }, locator);

        if (ret.value === null){
            throw new Error('getElementInnerHTMLByScLocator could not find element with locator: ' + locator);
        }
        return ret.value;
    },

    getElementValueByScLocator: async function(locator){
        /*  Returns the value of an element, given a locator
         :Args:
         - locator: the locator of the element
         :Returns:
         - The value
         :Usage:
         -  driver.getElementValueByScLocator('//[ID="isc_alu_nms_AlarmInfoPanel_0"]/member[Class=HLayout||classIndex=0]/member[Class=SectionStack||classIndex=0]/section[Class=SectionHeader||title=General]/item[Class=DynamicForm||classIndex=0]/item[name=alarmName||Class=TextItem]/element');
         >>AccessInterfaceDown
         */

        var ret = await driver.execute(function(loc)
        {
            return isc.AutoTest.getElement(loc).value;
        }, locator);

        return ret.value;
    },


    getElementTitleByScLocator: async function(locator){
        /*  Returns the title of an element, given a locator
        :Args:
            - locator: the locator of the element
        :Returns:
            - The title
        :Usage:
            -  driver.getElementTitleByScLocator('//[ID="isc_Button_0"]');
              >>> "<div>Some Text</div>"
        */
        
        var ret = await driver.execute(function(loc)
        {
            return isc.AutoTest.getElement(loc).title;
        }, locator);

        return ret.value
    },

    getActiveObjectAttribute: async function(attribute){
        /*
        get active object attribute from the web page
        */
        var ret = await driver.execute(function(attr)
        {
            return alu.nms.SamAutoTest.getObject(alu.nms.SamAutoTest.getLocator(document.activeElement))[attr];
        }, attribute);

        return ret.value;
    },

    selectNavigationButton: async function(){
        /* Open the navigation pane and select a row/menu item
         :Args:
         - row: row # or title of the menu item
         :Usage:
         - selectNavigationButton("Equipment View")
         */

        var row = arguments[0].toLowerCase().indexOf("log") >= 0 ? "Sign out" : arguments[0];
        var xpath = '//*[@eventproxy="isc_alu_nms_ApplicationMenu_0"]//*[contains(text(), "'+ row +'")]';

        // Original "Back to Launchpad", new "launchpad" .. so look for 'aunchpad'
        if (row.toLowerCase().indexOf("launchpad") >= 0){
            xpath = '//*[@eventproxy="isc_alu_nms_ApplicationMenu_0"]//*[contains(text(), "aunchpad")]'
        }

        await driver.click('//*[contains(@eventproxy, "NavigationButton")]');
        await driver.pause(1000);

        var isExisting = await driver.isExisting('//*[@eventproxy="isc_alu_nms_ApplicationMenu_0"]');

        if(isExisting) {
            await driver.execute(function(appName) 
            {
                var elements = document.getElementsByClassName('dashboard__appTile__title');
                for (var i = 0; i < elements.length; i++) {
                    if (elements[i].textContent.trim() === appName) {
                        elements[i].scrollIntoView(false);
                        break;
                    }
                }
            }, row)

            await driver.internalWaitForVisible(xpath, 2000);
            await driver.click(xpath);

        } else {
            // If 'not a number', prefix it with title=
            if (isNaN(row)){ row = "title=" + row; }
            var rowLocator = '//Menu[level=0]/body/row[' + row + ']/col[1]';

            await driver.internalWaitForExist('//*[contains(@eventproxy, "isc_Menu")]', 10000)
            await driver.clickElementByScLocator(rowLocator);
        }
    },

    openPerspective: async function(title){
        // Opens up the given perspective (The Title buttons near the top of your app)
        var locator = '//[ID="isc_alu_nms_SAMDashboardHeader_0"]/member[Class=HLayout||classIndex=1]/member[Class=Button||title='+ title +']';
        await driver.clickElementByScLocator(locator);
    },

    openHelpAppFromBanner: async function(){
        // Opens up the Help App by pressing the help app button located on the app banner.
        // To be used in conjunction with closeWindowsNotSpecified
        // Returns: (string or null) original window handle ID if new window appeared, null otherwise
        var initialHandle = await driver.windowHandle();
        // some error occurred
        if (typeof(initialHandle) !== 'object' || typeof(initialHandle.value) !== 'string'){
            return null;
        }
        var retVal = initialHandle.value;

        // click help center button and wait for the new help app window to appear before returning
        var initialHandleList = await driver.windowHandles();
        var currentHandleList;
        await driver.click('//*[@eventproxy="alu_nms_ApplicationBanner"]//*[contains(@eventproxy,"alu_nms_HelpCenterButton_")]');
        for (var i = 0; i < 10; i++){
            await driver.pause(1000);
            currentHandleList = await driver.windowHandles();
            if (currentHandleList.value.length > initialHandleList.value.length){
                return retVal; 
            }
        }
        return null;
    },

setAppExportToWindow: async function(){
        /* driver function overwrites exportClientData to export into a new window
           driver should be called after your app is loaded.  When the page is reloaded/refreshed,
           exportClientData will return to its default behaviour.

            WARNING! Do not call driver function more than once from the same page. It will create an endless loop.

           For ListGrids, when exporting 'All' it uses exportData() and you should use our function
           in ListPanel.js called getExportData() for all listgrid exporting
        */
        return driver.execute(function()
        {
            isc.DataSource.addClassMethods({
                _oldExportClientData: isc.DataSource.exportClientData
            });

            isc.DataSource.exportClientData = function(a,b,c,d)
            {
                b.exportDisplay = "window";
                b.downloadToNewWindow = true;
                if (typeof b.exportContext !== "undefined"){
                    b.exportContext.exportDisplay = "window";
                    b.exportContext.downloadToNewWindow = true;
                }
                this._oldExportClientData(a,b,c,d);
            };
        });
    },

    setAppJNLPToDialog: async function(){
        /* This function overwrites alu.nms.NavigationUtil.navigate to display the arguments in a popup dialog.
           This should be called after your app is loaded.  When the page is reloaded/refreshed,
           alu.nms.NavigationUtil.navigate will return to its default behaviour.

            WARNING! Do not call this function more than once from the same page. It will create an endless loop.

            The content will be seperated by a comma in the dialog:
                - ACTION_TYPE,faultManager:svc-mgr@service:315......
                - You can get this content from driver.checkWarning()
        */

        return driver.execute(function(){
            if (alu.nms.NavigationUtil._oldNavigate === undefined && alu.nms.NavigationUtil._oldNavigatetoNfmp === undefined){
                alu.nms.NavigationUtil.addClassMethods({
                    _oldNavigate: alu.nms.NavigationUtil.navigate,
                    _oldNavigatetoNfmp: alu.nms.NavigationUtil.navigatetoNfmp
                });
            
                // Deprecated Method
                alu.nms.NavigationUtil.navigate = function(aInFdns_o, aInAction_s, aInSelectedTab_s, aInParams_o)
                {
                    isc.say(aInAction_s + "," + (aInFdns_o === null ? "null" : aInFdns_o[0]));
                    this._oldNavigate(aInFdns_o, aInAction_s, aInSelectedTab_s, aInParams_o);
                };
            
                // New Method
                alu.nms.NavigationUtil.navigatetoNfmp = function(aInSystemFdn_s, aInFdns_o, aInAction_s, aInSelectedTab_s, aInParams_o)
                {
                    isc.say(aInAction_s + "," + (aInFdns_o === null ? "null" : aInFdns_o[0]));
                    this._oldNavigatetoNfmp(aInSystemFdn_s, aInFdns_o, aInAction_s, aInSelectedTab_s, aInParams_o);
                };
            
            }
        });
    },

    getInfoPanelData: async (xpath) => 
    {
        // Returns the data from an Info Panel as an Object
        //     xpath: the locator for the encasing div, ex. '//*[@class="row-container"]/div[2]'
        // Sample Return: 
        //     { Info: { Name: "default_tunnel_selection", ...}, Modified Properties: {...}}

        return driver.execute(function(xpath)
        {
            var parent = document.evaluate(xpath, document, null, XPathResult.ANY_TYPE, null).iterateNext();
            var title = parent.children[0].textContent // "Info"
            var div = parent.children[2];
            var data = {};

            for (let i = 0; i < div.children.length; i++) {
                // New title test - currently all "titles" are in <p> tags
                if (div.children[i].tagName === 'P'){
                    title = div.children[i].innerText;
                    continue;
                }
                
                // Some bodies won't have a title, so select index 0
                let bodyIndex = div.children[i].children.length == 1 ? 0 : 1;
                let bodyTitle = div.children[i].children[0].innerText;
                
                // Bodies can contain anything, test some common tags
                let body = div.children[i].children[bodyIndex].getElementsByTagName('input')[0];
                if (!body) {
                    body = div.children[i].children[bodyIndex].getElementsByTagName('textarea')[0];
                }
                if (!body) {
                    body = {'value': div.children[i].children[bodyIndex].innerText};
                }

                // If its a new title, add an entry
                if (!data.hasOwnProperty(title)){
                    data[title] = {};
                }
                data[title][bodyTitle] = body.value;
            }
            return data;

        }, xpath).then(ret => {
            return ret.value;
        });

    },

    
    fixAutoTestGetAttribute: async () => {
        // This function reverts smartclient's AutoTest.getAttribute function to how it was in v9
        // In v12 they introduced .trim("/") which isn't working for some apps.
        // This function should be removed when that issue is addressed at the app level
        return driver.execute(function(){
            isc.AutoTest.getAttribute = function(_1,_2){
                if(!_1)
                    return null;
                _1=_1.replace(/^(scLocator|ScID)=/i,"");
                if(_1.startsWith("'")||_1.startsWith('\"'))
                    _1=_1.substring(1);
                if(_1.endsWith("'")||_1.endsWith('\"'))
                    _1=_1.substring(0,_1.length-1);
                if(!_1.startsWith("//")){
                    if(_1.startsWith("ID=")||_1.startsWith("id=")){
                        _1=_1.substring(3)
                    }
                    _1='//*any*[ID=\"'+_1+'\"]'
                 }
                 
                var _3=_1.split("/"), _4;
                var _5=_3[2];
                if(!_5)
                    return null;
                _3=_3.slice(3);
                var _6={attribute:_2}, _7 = this.getBaseComponentFromLocatorSubstring(_5,_6);
                if(!_7)
                    return null;
                return _7.getAttributeFromSplitLocator(_3,_6)    
            }
        });
    },

    /********************************************************************************
     ********************************************************************************
 
     *                       RENAMED FUNCTIONS

        The below functions have been remamed in nsp-app-test-common and will redirect
        to those new functions if nsp-app-test-common is installed.  You should use
        the newly named functions and not these ones.

     ********************************************************************************
     ********************************************************************************/

    loadDashboard: async function(){
        /* Loads the main page (login) for the given server
       :Args:
            - server: Server IP to open
        */

        // loadDashboard() does not exist in nsp-app-test-common as it is renamed to openLoginPage()
        if (__APP_COMMON){
            return driver.openLoginPage();
        }

        _urlProtocol = (typeof arguments[1] === 'string') ? arguments[1] : 'https';

        await driver.windowHandleMaximize();
        await driver.secureUrl(_urlProtocol + "://" + __SERVER);
        await driver.pause(5000); // URL redirection

        var url = await driver.url();

        if (url.value.toLowerCase().indexOf('cas') === -1){
            _urlProtocol = 'http';
            return driver.url(_urlProtocol + "://" + __SERVER)
        }
    },

    logout: async function(){
        /* Logs out from the app-dashboard or from inside the app */

        if (__APP_COMMON){
            return driver.bannerLogout();
        }
        else {
            await common.launchpad.logout();
        }
    },


    /********************************************************************************
     ********************************************************************************
 
     *                       DEPRECATED FUNCTIONS

        The below functions can be found in nsp-app-test-common.  They remain in this
        file for backwards compatibility purposes, but will no longer be maintained.

     ********************************************************************************
     ********************************************************************************/


    login: async function(user, pass){

        // The below code will only get executed if __APP_COMMON is not defined
        // Else, driver.login() will be overwritten by __APP_COMMON.bindings.login.login();
        // ---------------------------------------------------------------------------------

        var launchpadLoc = '//*[contains(text(), "' + user + '") or contains(text(), "password_expired")]';
        var skipUsername = false;

        await driver.waitForExist(_usernameXpath, 300000)
        let exists = await driver.isExisting(_rememberXpath);
        if (exists){
            let ret = await driver.execute(function(){ 
                return document.getElementsByTagName('input')[0].value;
            });
            if (ret.value === user){
                skipUsername = true;
            } 
            else if (typeof ret.value === "string" && ret.value.length > 0){
                await driver.execute(function(){
                    let x = document.getElementsByTagName('input');
                    x[x.length - 1].click();
                });
                await driver.pause(500);
                await driver.refresh();
                await driver.pause(2000);
                await driver.execute(function(){ // Special case for IE to click the override link                                    
                    var x = document.getElementById('overridelink') || document.getElementById('proceed-link')
                    if (x) x.click();
                });
                await driver.waitForExist(_usernameXpath);
            }
        }

        if (!skipUsername)
            await driver.setValue(_usernameXpath, user);


        await driver.waitForExist(_passwordXpath, 15000) // ie11 sometimes loads password field seconds after username
        await driver.setValue(_passwordXpath, pass)
        await driver.internalClick(_loginButtonXpath)
        return driver.internalWaitForExist(launchpadLoc, 90000).then((isExisting) =>{
            if (!isExisting && !LOGIN_RETRY){
                LOGIN_RETRY = true;
                return driver.testLogin(user, pass);
            }
        });
    },

    // Checks if the login screen is present.  If it is, log in
    testLogin: async (user, pass) => {
        await driver.pause(1000)
        await driver.isExisting(_usernameXpath).then((isExisting) => {
            if (isExisting){
                return driver.login(user, pass).then(() =>{
                    return isExisting;
                });
            }
            return isExisting;
        });
    },


    skipServerErrors: async() => {
        // do nothing, this is for backwards compatibilty  
    },



    /********************************************************************************
     ********************************************************************************
 
     *                       LEGACY UTIL FUNCTIONS

        The below functions were used at one time and likely aren't used anymore.
        For backwards compatibility's sake, they're being left here.  Use at your
        own risk!

     ********************************************************************************
     ********************************************************************************/

    ftpPut: async function(){
        /* Copies a given file using FTP put cmd from grid to a given remote location.

        :Args:
            - hostIP:     IP of remote host.
            - userName:   FTP username to connect to the remote host.
            - password:   FTP password to connect to the remote host.
            - localFile:  Name of the local file you wish to copy to remote host.
            - remoteFile: Name of the file in the remote host.
        :Usage:
            - ftpPut(server, userName, password, "fileA.xml", "fileB.xml", function(err, ret){ console.log(ret); });
        */
        var hostIP   = arguments[0];
        var userName = arguments[1];
        var password = arguments[2];
        var localFile = arguments[3];
        var remoteFile = arguments[4];

        var ftp = new JSFtp({
            host: hostIP,
            user: userName,
            pass: password,
            debugMode:true
        });

        return new Promise((resolve, reject) => {
            ftp.put(localFile, remoteFile, function(err, ret){
                if (err) {
                    console.log("PUT ERR: " + err);
                } else {
                    console.log("File transferred successfully!");
                }
                ftp.raw.quit(function(err, ret){
                    if(err){
                        console.log("QUIT ERR: " + err);
                    }
                    resolve(ret);
                });
            });
        });
    },


    /**
     * Create/fire a mouse wheel event (IE, Chrome, FX may have different ways to perform it) and pass it to the SVGContainer DOM element
     * Returns the real delta as received in smartclient (In FX, for example, if an event is fired with detailArg=-5.4, the event received in smartclient
     * is rounded (either floor or ceil); don't ask why ; but in IE and chrome the real delta equals aInDelta_f)
     * Original Author: Gerald Coelho (wireless-ne-views-app)
     *
     * @params
     *  - aInOptions_o: an object containing the delta and ONE search criteria for the element:
     *                  id || name || className || tagName
     *  Examples:
     *  { delta: 2, id: 'SVGContainer' }
     *  { delta: 2, name: 'username' }
     *  { delta: 2, tagName: 'canvas' } or { delta: 2000, tagName: 'svg' }
     *  { delta: 2, className: 'histogram-3d' }
     *
     */
    mousewheel: async function(aInOptions_o)
    {
        var fireMouseWheelEvent_h;

        var aInDelta_f = aInOptions_o.delta;
        var lRealDelta_f = aInDelta_f;

        //http://www.javascriptkit.com/javatutors/onmousewheel.shtml
        if (driver.desiredCapabilities.browserName === "chrome" || driver.desiredCapabilities.browserName === "internet explorer")
        {
            fireMouseWheelEvent_h = function (aInOptions_o, aInDelta_f)
            {
                var evt = document.createEvent("MouseEvents");
                evt.initEvent('mousewheel', true, true);
                // This property indicates the distance that the wheel has rotated, expressed in multiples of 120. A positive value indicates that the wheel has rotated away from the user. A negative value indicates that the wheel has rotated toward the user.
                // A value of 120 means the mouse wheel has been moved up one "click", while -120 means down one "click". If the user quickly moves the mouse wheel 3 clicks upwards for example, "wheelDelta" equals 720
                evt.wheelDelta = 120 * (-aInDelta_f);

                // get the DOM element which will receive the event
                var elem;
                if (aInOptions_o.id){
                    elem = document.getElementById(aInOptions_o.id);
                }
                else if (aInOptions_o.className){
                    elem = document.getElementsByClassName(aInOptions_o.className)[0];
                }
                else if (aInOptions_o.name){
                    elem = document.getElementsByName(aInOptions_o.name)[0];
                }
                else if (aInOptions_o.tagName){
                    elem = document.getElementsByTagName(aInOptions_o.tagName)[0];
                }

                if (elem){
                    elem.dispatchEvent(evt);
                    return true;
                }
                return false;

            };
        }

        if (driver.desiredCapabilities.browserName === "firefox")
        {
            // Real detail arg received in smartclient
            var lRealDetail_i = aInDelta_f<0 ? Math.ceil(3*aInDelta_f):Math.floor(3*aInDelta_f);
            lRealDelta_f = lRealDetail_i/3;

            // based on reproduction of the event generated when zoom in/out is performed manually
            fireMouseWheelEvent_h = function (aInOptions_o, aInDelta_f)
            {
                // event types supported by Gecko : "MouseScrollEvents"
                var evt = document.createEvent("MouseScrollEvents");
                // Warning regarding use of DOMMouseScroll but this is what is currently fired by FX
                // https://developer.mozilla.org/en-US/docs/Web/Events/DOMMouseScroll

                evt.initMouseEvent(
                    'DOMMouseScroll', // in DOMString typeArg,
                    true,  // in boolean canBubbleArg,
                    true,  // in boolean cancelableArg,
                    window,// in views::AbstractView viewArg,
                    3*aInDelta_f,   // in long detailArg, positive values indicating scrolling downward and negative values indicating scrolling upward.
                                    // Smartclient encapsulates this DOMMouseScroll event into a more generic event (which is browser independant)
                                    // In order to have the appropriate value of wheeldelta inside the generic event, detailArg of DOMMouseScroll event must be a multiple of 3.
                    0,     // in long screenXArg,
                    0,     // in long screenYArg,
                    0,     // in long clientXArg,
                    0,     // in long clientYArg,
                    0,     // in boolean ctrlKeyArg,
                    0,     // in boolean altKeyArg,
                    0,     // in boolean shiftKeyArg,
                    0,     // in boolean metaKeyArg,
                    0,     // in unsigned short buttonArg,
                    null   // in EventTarget relatedTargetArg
                );

                // get the DOM element which will receive the event
                var elem;
                if (aInOptions_o.id){
                    elem = document.getElementById(aInOptions_o.id);
                }
                else if (aInOptions_o.className){
                    elem = document.getElementsByClassName(aInOptions_o.className)[0];
                }
                else if (aInOptions_o.name){
                    elem = document.getElementsByName(aInOptions_o.name)[0];
                }
                else if (aInOptions_o.tagName){
                    elem = document.getElementsByTagName(aInOptions_o.tagName)[0];
                }

                if (elem){
                    elem.dispatchEvent(evt);
                    return true;
                }
                return false;
            };
        }

        var ret = await driver.execute(fireMouseWheelEvent_h, aInOptions_o, aInDelta_f);
        return {
            ret: ret, 
            lRealDelta_f: lRealDelta_f
        };
    },

    execTelnet: async function(params){
        /*
            Executes a telnet request against a server with single or multiple commands, returning the response
            :Args:
                - params: a JSON formatted object
                    {  cmd: "telnet command",
                       server: "server to execute against, default is current SERVER"
                       username: "root",
                       password: "some password"
                     }

            :Usage:
                - driver.execTelnet({cmd: "ls"}, function(response){ console.log(response); })
                - driver.execTelnet({cmd: ["cd /root", "ls"]}, function(response){ console.log(response); })
                - driver.execTelnet({cmd: "ls", server: "1.2.3.4"}, function(response){ console.log(response); })

        */
        var testServer = params['server'] ? params['server'] : (__SERVER.indexOf(':') >= 0 ? undefined : __SERVER),
            user = params['username'] ? params['username']  : 'root',
            pass = params['password'] ? params['password']  : TELNET_PASSWORD,
            timeout = params['timeout'] ? params['timeout']  : 10000,
            commands = params['cmd'];

        if (telnet === undefined || !testServer){
            console.log(params)
            return driver;
        }

        if(typeof commands === "string"){
            commands  = [commands];
        }

        var telnetParams = {
            host: testServer,
            port: 23,
            timeout: timeout,
            username: user,
            password: pass
        }

        console.log("<br />Telnet Params: ", telnetParams);
        console.log("<br />Command:", commands);

        var connection = new telnet();
        var response = "";

        await connection.connect(telnetParams);
        for (let i = 0; i < commands.length; i++) {
            let ret = await connection.exec(commands[i]);
            response += ret;
        }
        await connection.end();
        return response;
    },

    restartTomcat: function(optionalServer)
    {
        /*
            Args:
                - optionalServer: instead of the SERVER assigned in loadDashboard()

            Two scenarios:
                1. Restart tomcat on SAM server
                2. Restart tomcat on machine running vagrant, whose vagrantfile exists somewhere in /home
                    - where we will ssh into vagrant first

            It is assumed we will ssh into vagrant if the SERVER contains :8686
            The socket will timeout after 10 minutes (takes a really long time on a vSAM)
        */
        var telnetIp = (typeof optionalServer === "string" ? optionalServer : SERVER);

        if (telnetIp === "")
        {
            throw Error("SERVER not defined by loadDashboard().  Either call loadDashboard() first or pass in the server parameter.  When passing in the server, make sure to include the :8686 port if applicable.");
        }

        var vagrantCommand = "cd `find /home -name '*Vagrantfile*' | awk '{ gsub(\"Vagrantfile\",\"\"); print $1 }'`;vagrant ssh -c '";
        var tomcatBinCommand = "cd /tools/tomcat/bin;";
        var catalinaOut = "/tools/tomcat/logs/catalina.out"

        // IF NOT VAGRANT
        if (telnetIp.indexOf(":8686") === -1){
            vagrantCommand = "";
            tomcatBinCommand = "cd /opt/" + _samDir + "/server/nms/web/tomcat/bin;";
            catalinaOut = "/opt/" + _samDir + "/server/nms/log/webserver/WebServer.log";
        }

        var sedCommand = "sed -i s/Server\\ startup/oldstartup/g " + catalinaOut + ";";
        var stopCommand = "./shutdown.sh;sleep 10;";
        var startCommand = "sleep 5;nohup ./startup.sh;";
        var waitCommand = "while ! grep \"Server startup\" " + catalinaOut + "; do sleep 5; done;sleep 20;exit;";

        var fullCommand = vagrantCommand
                        + tomcatBinCommand
                        + stopCommand
                        + sedCommand
                        + startCommand
                        + waitCommand
                        + (vagrantCommand === "" ? "" : "'");

        var params =  {
                cmd: fullCommand,
                server: telnetIp.split(":")[0],
                username: "root",
                password: TELNET_PASSWORD,
                timeout: 600000
        };

        return driver.execTelnet(params);
    },

    stopTomcat: function(optionalServer)
    {
        /*
            Args:
                - optionalServer: instead of the SERVER assigned in loadDashboard()

            Two scenarios:
                1. Stop tomcat on SAM server
                2. Stop tomcat on machine running vagrant, whose vagrantfile exists somewhere in /home
                    - where we will ssh into vagrant first

            It is assumed we will ssh into vagrant if the SERVER contains :8686
            The socket will timeout after 10 minutes (takes a really long time on a vSAM)
        */
        var telnetIp = (typeof optionalServer === "string" ? optionalServer : __SERVER);

        if (telnetIp === "")
        {
            throw Error("SERVER not defined by loadDashboard().  Either call loadDashboard() first or pass in the server parameter.  When passing in the server, make sure to include the :8686 port if applicable.");
        }

        var vagrantCommand = "cd `find /home -name '*Vagrantfile*' | awk '{ gsub(\"Vagrantfile\",\"\"); print $1 }'`;vagrant ssh -c '";
        var tomcatBinCommand = "cd /tools/tomcat/bin;";

        // IF NOT VAGRANT
        if (telnetIp.indexOf(":8686") === -1){
            vagrantCommand = "";
            tomcatBinCommand = "cd /opt/" + _samDir + "/server/nms/web/tomcat/bin;";
        }

        var stopCommand = "./shutdown.sh;sleep 10;";
        var fullCommand = vagrantCommand
                        + tomcatBinCommand
                        + stopCommand
                        + (vagrantCommand === "" ? "" : "'"); // ' is there to close the ssh -c '...

        var params =  {
                cmd: fullCommand,
                server: telnetIp.split(":")[0],
                username: "root",
                password: TELNET_PASSWORD,
                timeout: 600000
        };

        return driver.execTelnet(params);
    },

    startTomcat: async function(optionalServer)
    {
        // calls restartTomcat as it's the same code, and it's fine to execute "shutdown" on a tomcat that's down
        return driver.restartTomcat.apply(driver, arguments);
    },

    getFilePaths: function(){
        return {
            LINKPATH: __LINKPATH,
            SAVEPATH: __SAVEPATH,
            SSPATH: __SSPATH
        };
    },

    getGridIp: function(){
        return __GRID_IP;
    },

    getCurrentBrowser: function() {
        return __BROWSER;
    },

};


/********************************************************************************
 ********************************************************************************

 *                       PRIVATE HELPER FUNCTIONS

    The below functions are used throughout the above functions, but aren't
    available for anyone to access directly

 ********************************************************************************
 ********************************************************************************/

var testSecureOSS = async function(server){
    /*
       This function tests the insecure port to determine 
       if subsequent OSS requests should be secure
    */
    if (typeof SECURE_OSS === "boolean"){
        return;
    }
    var postRequest = {
        host    : server,
        path    : "/xmlapi/invoke",
        port    : 8080,
        method  : "GET",
        headers : { 'Content-Type': 'text/xml; charset=UTF-8' }
    };

    return new Promise((resolve, reject) => {

        var req = http.request(postRequest, function(res) {
            res.on("data", function(data){
                data = data.toString('utf-8');
                //405 means GET not allowed but xmlapi is there
                if(/HTTP\ Status\ 405/i.exec(data)!==null || /GET\ is\ not\ supported/i.exec(data)!==null){
                    SECURE_OSS = false;
                }
                //On upgraded NFMP port is up but we get a 404 status code
                else{
                    SECURE_OSS = true;
                }
                resolve();
            });
            
            res.on("end", function(){
            });
        });
        req.on("error", function(e){
            // e['code'] === "ECONNREFUSED"
            SECURE_OSS = true;
            resolve();
        });

        req.write("");
        req.end();
    });
}

var isRealBrowser = (browser) =>
{
    return browser !== 'phantomjs' && browser !== 'builder' && typeof browser ==='string';
}

var checkWarningReact = async function(buttonToPress, clickCheckBox){
    // By default, press the first flatbutton and return the content of the warning
    // Only if a warning is present
    // Args: 
    // - buttonToPress(optional, string) = 'Cancel', 'OK', 'Delete', etc.
    // - clickCheckbox(optional, boolean) = true
    var baseXpath = '//*[contains(@class, "ReactModal__Content ReactModal__Content--after-open")]';
    var dialogXpath = baseXpath + "//*[@data-component-id='nokia-react-components-dialogcontent']";
    var checkboxXpath = baseXpath + '//*[@data-component-id="nokia-react-components-checkbox"]';
    var buttonXpath = baseXpath + '//*[@data-component-id="nokia-react-components-flatbutton" or @data-component-id="nokia-react-components-button"]';
    

    // If the dialog does not exist, then the popup might not actually exist
    // Other react components can use the same class as defined in baseXpath
    // as a result, this function is called from handleTcExcept and false
    // errors will occur in afterEach(), ending the test suite
    var bodyText = "";
    if (await driver.internalWaitForExist(dialogXpath, 2000)){
        bodyText = await driver.getText(dialogXpath);
    }
    
    if (typeof buttonToPress === "boolean"){
        clickCheckBox = buttonToPress;
    }
    else if (typeof clickCheckBox !== "boolean"){
        clickCheckBox = false;
    }
    
    if (clickCheckBox && await driver.internalWaitForExist(checkboxXpath, 500)){
        await driver.click(checkboxXpath);
    }
    
    if (typeof buttonToPress === "string"){
        // OK, Delete, Cancel
        buttonXpath = baseXpath + '//*[contains(text(), "' + buttonToPress + '")]'
    }
    
    // Only click button if it exists
    if (await driver.internalWaitForExist(buttonXpath, 500)) {
        await driver.click(buttonXpath);
    }
    
    return bodyText;
};
