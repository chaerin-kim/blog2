const hamBtn = document.querySelector('.ham');
const header = document.querySelector('.hd');
const darkmode = document.querySelector('.darkmode')

//ham 구현
hamBtn.addEventListener('click', ()=>{
  header.classList.toggle('on')
})

//darkmode 토글
darkmode.addEventListener('click', (e)=> {
  // e.stopPropagation()
  e.target.classList.toggle('on')
  document.body.classList.toggle('dark')
})