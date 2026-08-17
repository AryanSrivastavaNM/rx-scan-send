# Rx Scan & Send

I want to build a web portal, that can be opened from the Mobile apps primarily. So the UI should be compatible to be viewed in the mobile screens. Below are the functionalities to be implemented:
- This web portal will be launced for the first time from using QR code. This QR code will be pasted at the pharmacy and the user will use it to launch this web portal. So the landing page should have the name of the pharamcy, its other details / logo etc.,
- then the user should be able to login with their phone number. For the first time it should go through OTP confirmation, then they shoudl be able to setup a 4 digit PIN
- the main landing page will have ability to load prescriptions. it will be a .pdf or a jpeg file.
- the tool should automatically read the medicine info from the prescription and it should be displayed for user confirmation. once user confirms this gets sent to the pharmacy to be serviced
- since this web page is loaded in the mobile, using camera the user should be able to capture the image and load a new prescription, from which the medicine data should be extracted and the user should be able to press a button to send it to the pharmacy

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6e817381-adbb-477a-8b98-4b592ea8a64c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm install
npm run dev
```
