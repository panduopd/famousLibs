import {createElement, render, useState, useEffect} from './utils/PDreactDom'

/** @jsx createElement */
function App(props) {

  const [counter, setCounter] = useState(0)

  useEffect(()=>{
    console.log('counter changed')

    return () => {
      console.log('clear callback')
    }
  },[counter])

  return (
    <div id="foo">
      <a>counter:  {counter}</a>
      <b>Hi: {props.name}</b>
      <button onClick={() => {
        setCounter(counter+1)
        // setCounter(c=>c+1)
      }}>click</button>
    </div>
  )
}

const element = <App name="pd"/>
const root = document.getElementById('root')
render(element, root)