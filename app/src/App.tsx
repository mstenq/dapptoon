import './App.css';
import Gun from 'gun'
import 'gun/lib/radix.js'
import 'gun/lib/radisk.js'
import 'gun/lib/store.js'
import 'gun/lib/rindexed.js'

import {useEffect, useState} from 'react'

const gun = Gun({
  peers: ['http://localhost:8000'],
  localStorage: false,
  radisk: false // Disable localStorage for testing
})

// Add connection debugging
gun.on('hi', (peer: any) => {
  console.log('Connected to peer:', peer.id || peer)
})

gun.on('bye', (peer: any) => {
  console.log('Disconnected from peer:', peer.id || peer)
})

console.log('Gun instance created')

function App() {

  const [txt, setTxt] = useState()

  useEffect(() => {
    console.log('Setting up GunDB subscriptions...')
   
    gun.get('text').once((node) => {
      console.log('Initial node:', node)
      if(node == undefined) {
        console.log('No existing data, creating initial text')
        gun.get('text').put({text: "Write the text here"})
      } else {
        console.log("Found existing node, setting text:", node.text)
        setTxt(node.text)
      }
    })

    const unsubscribe = gun.get('text').on((node) => {
      console.log("Receiving real-time update:", node)
      if (node && node.text !== undefined) {
        setTxt(node.text)
      }
    })

    // Cleanup function
    return () => {
      if (unsubscribe && typeof unsubscribe.off === 'function') {
        unsubscribe.off()
      }
    }
  }, [])

  const updateText = (event: any) => {
    const newValue = event.target.value
    console.log("Updating text to:", newValue)
    
    // Update Gun first, then local state
    gun.get('text').put({text: newValue}, (ack) => {
      console.log('Put acknowledgment:', ack)
    })
    
    // Don't update local state here - let the .on() listener handle it
    // This prevents desync issues
  }

  return (
    <div className="App">
      <h1>Collaborative Document With GunJS</h1>
      <textarea value = {txt} onChange = {updateText}/>
    </div>
    
  );
}

export default App;