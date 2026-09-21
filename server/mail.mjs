import nodemailer from 'nodemailer'

export function createMailer(config) {
  const smtp=config.smtp
  if(!smtp?.host || !smtp.auth?.user || !smtp.auth?.pass) return null
  const transport=nodemailer.createTransport({host:smtp.host,port:Number(smtp.port||465),secure:smtp.secure!==false,requireTLS:true,auth:smtp.auth,
    logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true,connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000})
  return async ({to,subject,text,replyTo})=>{
    const result=await transport.sendMail({from:{name:'票夹',address:smtp.auth.user},to,subject,text,replyTo,disableFileAccess:true,disableUrlAccess:true})
    if(!result.accepted?.length || result.rejected?.length) throw new Error('Mail not accepted')
  }
}
