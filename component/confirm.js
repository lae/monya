const storage = require("../js/storage.js")
const coinUtil=require("../js/coinUtil")
const currencyList = require("../js/currencyList")
const bcLib = require('bitcoinjs-lib')
const errors = require("../js/errors")
const BigNumber = require('bignumber.js');
module.exports=require("./confirm.html")({
  data(){
    return {
      address:"",
      amount:"",
      fiat:"",
      feePerByte:0,
      fee:0,
      destHasUsed:false,
      message:"",
      myBalanceBeforeSending:0,
      showDetail:false,
      utxosToShow:null,
      signedHex:null,
      isEasy:false,
      coinType:"",
      ready:false,
      txb:null,
      addressPath:null,
      password:"",
      cur:null,
      insufficientFund:false,
      loading:true,
      incorrect:false,
      paySound:false
    }
  },
  store:require("../js/store.js"),
  mounted(){
    ["address","amount","fiat","feePerByte","message","coinType","txLabel"].forEach(v=>{
      this[v]=this.$store.state.confPayload[v]
    })
    this.cur=currencyList.get(this.coinType)
    this.$nextTick(this.build)
    currencyList.get(this.coinType).getAddressProp("totalReceived",this.address).then(res=>{
      if(res|0){
        this.destHasUsed=true
      }
    })
  },
  computed:{
    afterSent(){
      return (this.myBalanceBeforeSending-this.amount-this.fee)
    },
    utxosJson(){
      return JSON.stringify(this.utxosToShow)
    },
    build(){
      
      const cur =this.cur
      const targets = [{
        address:this.address,
        value:(new BigNumber(this.amount)).times(100000000).round().toNumber()
      }];
      if(this.message){
        targets.push({
          address:bcLib.script.nullData.output.encode(Buffer.from(this.message, 'utf8')),
          value:0
        })
      }
      storage.get("settings").then((data)=>{
        this.paySound=data.paySound
        return cur.buildTransaction({
          targets,
          feeRate:this.feePerByte,
          includeUnconfirmedFunds:data.includeUnconfirmedFunds
        })
      }).then(d=>{
        this.fee=(new BigNumber(d.fee)).divToInt(100000000)
        this.utxosToShow=d.utxos
        this.path=d.path
        this.myBalanceBeforeSending=d.balance
        this.txb=d.txBuilder
        this.ready=true
        this.loading=false
        return coinUtil.getPrice(cur.coinId,this.$store.state.fiat)
      }).then(price=>{
        this.price=price
      }).catch(e=>{
        this.ready=false
        this.loading=false
        if(e instanceof errors.NoSolutionError){
          this.insufficientFund=true
        }else{
          this.$ons.notification.alert("Error:"+e.message)
        }
      })
    }
  },
  methods:{
    next(){
      this.loading=true
      const cur=this.cur
      if (cur.sound&&this.paySound) {
        (new Audio(cur.sound)).play()
      }
      
      this.ready=false
      storage.get("keyPairs").then((cipher)=>{
        const finalTx=cur.signTx({
          entropyCipher:cipher.entropy,
          password:this.password,
          txBuilder:this.txb,
          path:this.path
        })
        return cur.pushTx(finalTx.toHex())
      }).then((res)=>{
        cur.saveTxLabel(res.txid,{label:this.txLabel,price:parseFloat(this.price)})
        this.$store.commit("setFinishNextPage",{page:require("./home.js"),infoId:"sent",payload:{
          txId:res.txid
        }})
        this.$emit("replace",require("./finished.js"))

        
      }).catch(e=>{
        this.loading=false
        if(e.request){
          this.$ons.notification.alert(e.request.responseText||"Network Error.Please try again")
        }else{
          this.incorrect=true
          this.ready=true
          setTimeout(()=>{
            this.incorrect=false
          },3000)
        }
      })
    }
  }
})
