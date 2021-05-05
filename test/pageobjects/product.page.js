import Page from './page';
import assert       from 'assert';

/**
 * sub page containing specific selectors and methods for a specific page
 */
class Product extends Page {
    /**
     * selectors using getter methods
     */
    get createAccountbutton() {return $('//*[@id="SubmitCreate"]')}
    get emailCreate() {return $('//*[@id="email_create"]')}
    



    addProduct(productName){
        //Faded Short Sleeve T-shirts
        let product='//*[@class="product-name" and contains(text(),"'+productName+'")]'
        let addToCart='//*[@class="product_list grid row"]//*[@title="Add to cart"]'
        let checkout='//*[@id="layer_cart"]//*[normalize-space(text())="Proceed to checkout"]'

        // this.internalSetValue('//*[@id="passwd"]',psw)
        this.internalClick('//*[@id="block_top_menu"]/ul/li[3]')
        $(product).moveTo()
        $(addToCart).waitForExist({ timeout: 10000 });
        let isexist=$(addToCart).isDisplayed()
        if(!isexist){
           throw new Error('Add to cart button is not visible...')
        }
        this.internalClick(addToCart)
        this.internalClick(checkout)
        browser.pause(10000)
    }

    checkoutProduct(productName){
        
        let checkout='//*[@class="cart_navigation clearfix"]//*[normalize-space(text())="Proceed to checkout"]'
        let termsNdCondition='//*[text()="Terms of service"]/following-sibling::p//input[@type="checkbox"]'
        let product='//*[@id="cart_summary"]//*[@class="'+productName+'"]'

        //checkout from summary tab
        this.internalClick(checkout)
        //checkout from address tab
        this.internalClick(checkout)
        //checkout from shipping tab
        this.internalClick(termsNdCondition)
        this.internalClick(checkout)
        
        //verify product in payment page
        let productCheckout=$(product).getText()
        assert(productCheckout===productName,"checkout product dosent match with final product")


    }

    

   
}

export default new Product();
