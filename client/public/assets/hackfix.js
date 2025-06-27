window.cpmstarAPI = () => {};

setInterval(() => {

    // ping so server will alive
    fetch(`${origin}/ping`).then(x => x.text()).then(x => {
        // console.info(x);
    });

}, 50000);

window.WebSocket = class extends WebSocket {

    constructor(_url, a) {
        super(origin, a);
    }

}

const shrink = 0.2;

let c = setInterval(() => {

    if (window.config) {
        window.config.mapScale = 14400 * shrink;
        window.config.snowBiomeTop = 2400 * shrink;
        window.config.riverWidth = 724 * shrink;
        window.config.riverPadding = 114 * shrink;
    }

    if (!window?.captchaCallback) return;
    
    window.captchaCallback();
    window.onload({});

    clearInterval(c);
}, 100);

Object.defineProperty(Object.prototype, "start", {
    get() {
        return this["‎start"];
    },
    set(val) {

        if (this.hasOwnProperty("regionInfo")) {
            this["‎start"] = a => a();
            return;

        }
        this["‎start"] = val;

    }
});

window.grecaptcha = {
    execute() {
        return new Promise(res => res("aaaaafg"))
    }
};