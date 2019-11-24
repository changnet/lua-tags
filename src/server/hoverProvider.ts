// 处理鼠标悬浮提示


export class HoverProvider {
    private static ins: HoverProvider;

    private constructor() {
    }

    public static instance() {
        if (!HoverProvider.ins) {
            HoverProvider.ins = new HoverProvider();
        }

        return HoverProvider.ins;
    }
}
