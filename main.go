package main

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"

	"github.com/getlantern/systray"
	"github.com/skip2/go-qrcode"
)

var lanURL string

func openBrowser(url string) {
	var err error
	switch runtime.GOOS {
	case "linux":
		err = exec.Command("xdg-open", url).Start()
	case "windows":
		err = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		err = exec.Command("open", url).Start()
	}
	if err != nil {
		log.Println("Failed to open browser:", err)
	}
}

func getLANIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return ""
	}
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ip4 := ipnet.IP.To4(); ip4 != nil {
				return ip4.String()
			}
		}
	}
	return ""
}

func startServer() {
	fs := http.FileServer(http.Dir("./dist"))
	http.Handle("/", fs)

	go func() {
		log.Fatal(http.ListenAndServe(":8000", nil))
	}()
}

func onReady() {
	// Load icon from file
	if iconData, err := os.ReadFile("tray_icon.png"); err == nil {
		systray.SetIcon(iconData)
	}
	systray.SetTitle("React Server")
	systray.SetTooltip("Serving your React app")

	mOpen := systray.AddMenuItem("Open App", "Open in browser")
	mCopy := systray.AddMenuItem("Copy LAN URL", "Copy link to clipboard")
	mQR := systray.AddMenuItem("Show QR Code", "Open QR code for phone")
	mQuit := systray.AddMenuItem("Quit", "Stop the server")

	go func() {
		for {
			select {
			case <-mOpen.ClickedCh:
				openBrowser("http://localhost:8000")
			case <-mCopy.ClickedCh:
				if runtime.GOOS == "windows" {
					exec.Command("cmd", "/c", "echo "+lanURL+"| clip").Run()
				} else if runtime.GOOS == "darwin" {
					cmd := exec.Command("pbcopy")
					cmd.Stdin = strings.NewReader(lanURL)
					cmd.Run()
				} else {
					cmd := exec.Command("xclip", "-selection", "clipboard")
					cmd.Stdin = strings.NewReader(lanURL)
					cmd.Run()
				}
			case <-mQR.ClickedCh:
				file := "lan_qr.png"
				_ = qrcode.WriteFile(lanURL, qrcode.Medium, 256, file)
				openBrowser(file) // opens image viewer
			case <-mQuit.ClickedCh:
				systray.Quit()
				return
			}
		}
	}()
}

func main() {
	port := 8000
	lanIP := getLANIP()
	lanURL = fmt.Sprintf("http://%s:%d", lanIP, port)

	fmt.Println("Serving at:", lanURL)

	startServer()

	systray.Run(onReady, func() {})
}
