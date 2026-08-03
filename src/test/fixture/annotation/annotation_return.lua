-- 干扰项1：函数上方的 @return 是这个函数的返回类型，不是文件返回类型
-- @return MailObjDecoy1 - 干扰用，不应该被 require 当成文件类型
function annotation_return_decoy1()
end

function annotation_return_decoy2()
    -- 干扰项2：函数体内部的 @return，更不是文件返回类型
    -- @return MailObjDecoy2 - 干扰用，不应该被 require 当成文件类型
end

-- @return MailObj - 返回邮件对象
return {}
