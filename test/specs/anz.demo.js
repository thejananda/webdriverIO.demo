import LoginPage from '../pageobjects/login.page.js';
import Product from '../pageobjects/product.page.js';
import assert       from 'assert';

let product="Faded Short Sleeve T-shirts"
let formData={
       "email":"anzdemo@gmail.com",
       "gender":"Mr",
       "firstName":"anzcomp",
       "lastName":"anz",
       "password":"anz1@demo",
       "dob":"4/12/1990",
       "add_company":"xccom",
       "add_address1":"2nd ,CROSS,3rd Main,Layout",
       "add_city":"Bankok",
       "add_state":"Alabama",
       "add_pincode":"56009",
       "add_phone":"9999999999",
       "add_alias":"xxxx xxxx xxx"
}

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
        // LoginPage.createAccount("theja2.2012@gmail.com","Mr","anzcomp","anz","anz1@demo","4/12/1990","xccom","2nd ,CROSS,3rd Main,Layout","Bankok","Alabama","56009","9999999999","xxxx xxxx xxx")
        LoginPage.createAccount(formData.email,formData.gender,formData.firstName,formData.lastName,formData.password,formData.dob,formData.add_company,formData.add_address1,formData.add_city,formData.add_state,formData.add_pincode,formData.add_phone,formData.add_alias)
         // console.log("test")
    });

    it('Verify Account created sucessfully', ()=>{
        LoginPage.verifyUserCreated(formData.firstName,formData.lastName)
    })

    it('logout of application ', ()=>{
        LoginPage.logOut()
    })

    it('Login to the application..', ()=>{
        LoginPage.login(formData.email,formData.password)
    })

    it('Add product to cart...', ()=>{
        Product.addProduct(product)
    })

    it('Checkout product...', ()=>{
        Product.checkoutProduct(product)
    })
});


