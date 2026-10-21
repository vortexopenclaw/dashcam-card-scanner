//! Standalone native GLib regression harness (no application/OCR build).

#[derive(Debug, Eq, PartialEq, Clone, Copy, glib::Enum)]
#[enum_type(name = "ScannerAuditEnum")]
#[repr(i32)]
pub enum AuditEnum {
    First = 0,
    Second = 1,
}

// Compile a real GTK macro expansion on Linux without starting a display server.
#[cfg(target_os = "linux")]
mod gtk_macro {
    use gtk::{glib, prelude::*, subclass::prelude::*};
    #[derive(Default, gtk::CompositeTemplate)]
    #[template(string = "<interface><template class='ScannerAuditWidget' parent='GtkBox'/></interface>")]
    pub struct AuditWidget {}
    #[glib::object_subclass]
    impl ObjectSubclass for AuditWidget {
        const NAME: &'static str = "ScannerAuditWidget";
        type Type = Widget;
        type ParentType = gtk::Box;
        fn class_init(klass: &mut Self::Class) { Self::bind_template(klass); }
        fn instance_init(obj: &glib::subclass::InitializingObject<Self>) { obj.init_template(); }
    }
    impl ObjectImpl for AuditWidget {}
    impl WidgetImpl for AuditWidget {}
    impl ContainerImpl for AuditWidget {}
    impl BoxImpl for AuditWidget {}
    glib::wrapper! { pub struct Widget(ObjectSubclass<AuditWidget>) @extends gtk::Box, gtk::Container, gtk::Widget; }
}

#[cfg(test)]
mod tests {
    use super::*;
    use glib::{prelude::*, variant::ToVariant};

    #[test]
    fn maintained_diagnostics_backend_expands_glib_derive() {
        let value = AuditEnum::Second.to_value();
        assert_eq!(value.get::<AuditEnum>().unwrap(), AuditEnum::Second);
    }

    // MUST run optimized: &p passed to the variadic C out-argument can be
    // optimized to NULL. Covers every function listed in RUSTSEC-2024-0429.
    #[test]
    fn variant_str_iter_all_affected_methods() {
        let v = ["zero", "one", "two", "three", "four", "five"].to_variant();
        assert_eq!(v.array_iter_str().unwrap().collect::<Vec<_>>(),
                   ["zero", "one", "two", "three", "four", "five"]);
        let mut i = v.array_iter_str().unwrap();
        assert_eq!(i.next(), Some("zero"));
        assert_eq!(i.next_back(), Some("five"));
        assert_eq!(i.nth(1), Some("two"));
        assert_eq!(i.nth_back(0), Some("four"));
        assert_eq!(i.last(), Some("three"));
        let mut i = v.array_iter_str().unwrap();
        assert_eq!(i.nth(usize::MAX), None);
        assert_eq!(i.next_back(), None);
        let empty: Vec<&str> = vec![];
        assert_eq!(empty.to_variant().array_iter_str().unwrap().last(), None);
    }
}
