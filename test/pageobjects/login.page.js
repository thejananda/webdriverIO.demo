import Page from './page';
import assert       from 'assert';


/**
 * sub page containing specific selectors and methods for a specific page
 */
class LoginPage extends Page {
    /**
     * selectors using getter methods
     */
    get createAccountbutton() {return $('//*[@id="SubmitCreate"]')}
    get emailCreate() {return $('//*[@id="email_create"]')}
    
    //elements of form page
    get from_createAccountForm(){return $('//*[text()="Create an account"]')}
    get from_firstName(){return $('//*[@id="customer_firstname"]')}
    get from_lastName(){return $('//*[@id="customer_lastname"]')}
    get from_passwd(){return $('//*[@id="passwd"]')}
    get from_addres_fisrtName(){return '//*[@id="firstname"]'}
    get from_addres_lastName(){return '//*[@id="lastname"]'}
    get from_addres_companyName(){return '//*[@id="company"]'}
    get from_addres_address1(){return '//*[@id="address1"]'}
    get from_addres_city(){return '//*[@id="city"]'}
    get from_addres_postcode(){return '//*[@id="postcode"]'}
    get from_addres_phone_mobile(){return '//*[@id="phone_mobile"]'}
    get from_addres_alias(){return '//*[@id="alias"]'}
    get from_addres_submitAccount(){return '//*[@id="submitAccount"]'}

    


    /**
     * a method to encapsule automation code to interact with the page
     * e.g. to login using username and password
     */
     createAccount (email,gender,firstName,lastName,password,dob,add_company,add_address1,add_city,add_state,add_pincode,add_phone,add_alias) {
         this.emailCreate.setValue(email);
         this.createAccountbutton.click();
         this.from_createAccountForm.waitForDisplayed(10000)
         if(gender==="Mr"){
            $('//*[@id="uniform-id_gender1"]').click()

         }else if(gender==="Mrs"){
            $('//*[@id="uniform-id_gender2"]').click()
         }
         this.from_firstName.setValue(firstName)
         this.from_lastName.setValue(lastName)
         this.from_passwd.setValue(password)
         //split date
         var arr = dob.split("/");
         $('//*[@id="days"]//option[@value="'+arr[0]+'"]').moveTo()
         $('//*[@id="days"]//option[@value="'+arr[0]+'"]').click()

         $('//*[@id="months"]//option[@value="'+arr[1]+'"]').moveTo()
         $('//*[@id="months"]//option[@value="'+arr[1]+'"]').click()

         $('//*[@id="years"]//option[@value="'+arr[2]+'"]').moveTo()
         $('//*[@id="years"]//option[@value="'+arr[2]+'"]').click()

         this.internalSetValue(this.from_addres_fisrtName,firstName) 
         this.internalSetValue(this.from_addres_lastName,lastName)         
         this.internalSetValue(this.from_addres_companyName,add_company)
         this.internalSetValue(this.from_addres_address1,add_address1)   
         this.internalSetValue(this.from_addres_city,add_city)

         //select state
         $('//*[@id="id_state"]//option[text()="'+add_state+'"]').moveTo()
         $('//*[@id="id_state"]//option[text()="'+add_state+'"]').click()      
        
         this.internalSetValue(this.from_addres_postcode,add_pincode)
         this.internalSetValue(this.from_addres_phone_mobile,add_phone)
         this.internalSetValue(this.from_addres_alias,add_alias)

         browser.pause(20000)

         this.internalClick(this.from_addres_submitAccount)

    }

    openLoginForm(){
        this.internalClick('//*[@class="login"]')
        let accountpage=$('//*[@class="page-heading" and text()="Authentication"]')
        let isexist=accountpage.waitForExist({ timeout: 10000 });
        if(!isexist){
           throw new Error('Account page didnt loaded..')
        }
        
    }

    logOut(){
        this.internalClick('//*[@class="logout"]')
    }

    login(email,psw){

        this.openLoginForm();
        this.internalSetValue('//*[@id="email"]',email)
        this.internalSetValue('//*[@id="passwd"]',psw)
        this.internalClick('//*[@id="SubmitLogin"]')
        browser.pause(10000)
    }

    verifyUserCreated(createdUsr_frstName,createdUsr_lastName){
        let usrCreatedpage=$('//*[@class="account"]')
        let isexist=usrCreatedpage.waitForExist({ timeout: 20000 });
       
        let usr=$('//*[@class="account"]').getText()
        console.log("created usr")
        console.log(usr)

        let arg=usr.split(" ")
        assert(arg[0]===createdUsr_frstName,"Created User name not matches..")
        assert(arg[1]===createdUsr_lastName,"Created User lastname not matches..")

    }

    /**
     * overwrite specifc options to adapt it to page object
     */
    open () {
        return super.open('login');
    }
}

export default new LoginPage();
