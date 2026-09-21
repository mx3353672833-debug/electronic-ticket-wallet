export type TicketOrigin={left:number;top:number;width:number;height:number}
export function ticketOrigin(element?:Element|null):TicketOrigin|null{
  if(!element)return null
  const image=element instanceof HTMLImageElement?element:element.querySelector('img')
  const box=(image||element).getBoundingClientRect()
  if(!box.width||!box.height||box.bottom<0||box.top>innerHeight)return null
  if(image?.naturalWidth && image.naturalHeight){
    const scale=Math.min(box.width/image.naturalWidth,box.height/image.naturalHeight)
    const width=image.naturalWidth*scale,height=image.naturalHeight*scale
    return {left:box.left+(box.width-width)/2,top:box.top+(box.height-height)/2,width,height}
  }
  return {left:box.left,top:box.top,width:box.width,height:box.height}
}
export function originTransform(origin:TicketOrigin|null,target:Pick<DOMRect,'left'|'top'|'width'|'height'>){
  if(!origin||!target.width||!target.height)return {x:0,y:10,scaleX:.97,scaleY:.97}
  return {x:origin.left+origin.width/2-target.left-target.width/2,y:origin.top+origin.height/2-target.top-target.height/2,scaleX:origin.width/target.width,scaleY:origin.height/target.height}
}
