/**
* main page object containing all methods, selectors and functionality
* that is shared across all page objects
*/
let POLLING = 10000;

export default class Page {

    /**
    * Opens a sub page of the page
    * @param path path of the sub page (e.g. /path/to/page.html)
    */
    open () {
        return browser.url(`http://automationpractice.com/index.php`)
    }

    internalSetValue(locator, value)  {
        $(locator).waitForExist( 5000);
        $(locator).clearValue()
        $(locator).setValue(value)
        let v=$(locator).getValue()
       if (value !== '' && v != value){
           throw new Error('internalSetValue - value not set properly: ')
       }
   }

   internalClearField(locator)  {
    let value =  $(locator).getValue();

    $(locator).click();
    browser.pause(250);
    for (let i = 0; i < value.length; i++){
              browser.keys("Backspace");
       }
    }

    internalClick(locator)
    {
        let isExisting=this.internalWaitForExist(locator, 5000)
            if (isExisting){
                console.log("clicking")
                $(locator).click();
            }        
            else {
                throw new Error('[internalClick] Locator did not exist, could not click: ' + locator);
            }
    }

    // This function is to simplify testcase code and catch rejected promises
    internalWaitForExist (locator, timeout, reverse) 
    {
        timeout = typeof timeout === "number"  ? timeout : POLLING;
        reverse = typeof reverse === "boolean" ? reverse : false;
        let isExisting= $(locator).waitForExist(timeout, reverse)
            if(isExisting) { // Promise Fulfilled
                return true;
            }else{  
                console.log("isExisting"); // Show the message
                console.log(isExisting)
                return false;
            }
    }
}
