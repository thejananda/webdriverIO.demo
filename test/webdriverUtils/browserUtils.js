
export default class webdriverUtils {
    
    open () {
        return browser.url(`http://automationpractice.com/index.php`)
    }

    internalSetValue(locator, value)  {
         browser.waitForExist(locator, 5000);
         browser.setValue(locator, value)
         let v=browser.getValue(locator)
        if (value !== '' && v != value){
            throw new Error('internalSetValue - value not set properly: ')
        }
    }
}
