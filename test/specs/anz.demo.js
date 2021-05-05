import LoginPage from '../pageobjects/login.page.js';
import Product from '../pageobjects/product.page.js';
import assert       from 'assert';

let product="Faded Short Sleeve T-shirts"

// let formData={
//     theja2.2012@gmail.com","Mr","anzcomp","anz","anz1@demo","4/12/1990","xccom","2nd ,CROSS,3rd Main,Layout","Bankok","Alabama","56009","9999999999","xxxx xxxx xxx"
// }

describe('My Login application', () => {

    it('Open app',()=>{
        LoginPage.open();
    })

    it('Create Account for user',  () => {
        //  browser.pause(10000)
         LoginPage.openLoginForm()
        //  LoginPage.login('theja2.2012@gmail.com','rama1@mb')
        //  LoginPage.verifyUserCreated('rammanna','mb')
        //  LoginPage.logOut()
         LoginPage.createAccount("theja2.2012@gmail.com","Mr","anzcomp","anz","anz1@demo","4/12/1990","xccom","2nd ,CROSS,3rd Main,Layout","Bankok","Alabama","56009","9999999999","xxxx xxxx xxx")
        // console.log("test")
    });

    it('Verify Account created sucessfully', ()=>{
        LoginPage.verifyUserCreated('rammanna','mb')
    })

    it('logout of application ', ()=>{
        LoginPage.logOut()
    })

    it('Login to the application..', ()=>{
        LoginPage.login('theja2.2012@gmail.com','rama1@mb')
    })

    it('Add product to cart...', ()=>{
        Product.addProduct(product)
    })

    it('Checkout product...', ()=>{
        Product.checkoutProduct(product)
    })
});


