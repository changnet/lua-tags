// 跳转到符号定义

export class Definition {
    private static ins: Definition;

    private constructor() {
    }

    public static instance() {
        if (!Definition.ins) {
            Definition.ins = new Definition();
        }

        return Definition.ins;
    }
}
